/**
 * Main-thread side of AudioSynthWorker: a small prioritized job queue (at
 * most two requests in flight, so an urgent first-use render never waits
 * behind the whole startup batch), replies paired by echoed request id.
 */

import type { AudioSynthRequest, AudioSynthResponse } from './synth/AudioSynthProtocol.ts'

export interface RenderedSound {
  channels: Float32Array[]
  loudnessDb: number
}

/** Lower runs first. */
export const RenderPriority = {
  URGENT: 0,
  NORMAL: 1,
  BACKGROUND: 2,
} as const
export type RenderPriority = (typeof RenderPriority)[keyof typeof RenderPriority]

type JobBody =
  | { kind: 'recipe'; recipe: string; seed: number; sampleRate: number }
  | { kind: 'impulse'; seconds: number; brightness: number; seed: number; sampleRate: number }

interface Job {
  body: JobBody
  priority: RenderPriority
  order: number
  resolve: (result: RenderedSound) => void
  reject: (error: Error) => void
}

const MAX_IN_FLIGHT = 2
const MAX_WORKER_RESTARTS = 3

export class AudioSynthClient {
  private worker: Worker | null = null
  private restarts = 0
  private nextRequestId = 1
  private order = 0
  private readonly queue: Job[] = []
  private readonly inFlight = new Map<number, Job>()
  private disposed = false

  renderRecipe(recipe: string, seed: number, sampleRate: number, priority: RenderPriority = RenderPriority.NORMAL): Promise<RenderedSound> {
    return this.enqueue({ kind: 'recipe', recipe, seed, sampleRate }, priority)
  }

  renderImpulse(seconds: number, brightness: number, seed: number, sampleRate: number): Promise<RenderedSound> {
    return this.enqueue({ kind: 'impulse', seconds, brightness, seed, sampleRate }, RenderPriority.URGENT)
  }

  dispose(): void {
    this.disposed = true
    this.worker?.terminate()
    this.worker = null
    const error = new Error('audio synth client disposed')
    for (const job of [...this.queue, ...this.inFlight.values()]) job.reject(error)
    this.queue.length = 0
    this.inFlight.clear()
  }

  private enqueue(body: JobBody, priority: RenderPriority): Promise<RenderedSound> {
    if (this.disposed) return Promise.reject(new Error('audio synth client disposed'))
    return new Promise((resolve, reject) => {
      this.queue.push({ body, priority, order: this.order++, resolve, reject })
      this.pump()
    })
  }

  private pump(): void {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length > 0) {
      const worker = this.ensureWorker()
      if (!worker) {
        const error = new Error('audio synth worker unavailable')
        for (const job of this.queue) job.reject(error)
        this.queue.length = 0
        return
      }
      let best = 0
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i]
        const b = this.queue[best]
        if (a.priority < b.priority || (a.priority === b.priority && a.order < b.order)) best = i
      }
      const job = this.queue.splice(best, 1)[0]
      const requestId = this.nextRequestId++
      this.inFlight.set(requestId, job)
      const request = { requestId, ...job.body } as AudioSynthRequest
      worker.postMessage(request)
    }
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker
    if (this.restarts > MAX_WORKER_RESTARTS) return null
    try {
      const worker = new Worker(new URL('../workers/AudioSynthWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<AudioSynthResponse>) => this.onResponse(event.data)
      worker.onerror = (event) => this.onWorkerError(worker, event)
      this.worker = worker
      return worker
    } catch (error) {
      console.warn('[Audio] synth worker failed to start:', error)
      this.restarts = MAX_WORKER_RESTARTS + 1
      return null
    }
  }

  private onResponse(response: AudioSynthResponse): void {
    const job = this.inFlight.get(response.requestId)
    if (!job) return
    this.inFlight.delete(response.requestId)
    if (response.ok) {
      job.resolve({ channels: response.channels, loudnessDb: response.loudnessDb })
    } else {
      job.reject(new Error(response.error))
    }
    this.pump()
  }

  private onWorkerError(worker: Worker, event: ErrorEvent): void {
    if (worker !== this.worker) return
    console.warn('[Audio] synth worker error:', event.message)
    event.preventDefault()
    worker.terminate()
    this.worker = null
    this.restarts++
    // A crashed worker loses its in-flight jobs: run them again on a fresh one.
    const lost = [...this.inFlight.values()]
    this.inFlight.clear()
    this.queue.unshift(...lost)
    this.pump()
  }
}
