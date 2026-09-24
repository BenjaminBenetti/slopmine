import type { LodInitRequest, LodWorkerRequest, LodWorkerResponse } from './LodTypes.ts'

/** Delay between worker creations (same staggering as the generation pool). */
const CREATE_STAGGER_MS = 100
/** Creation attempts per worker before giving up. */
const MAX_CREATE_ATTEMPTS = 3
/** A lost worker (crashed or stalled) is replaced after this delay... */
const RESTART_DELAY_MS = 500
/** ...at most this many times per slot. */
const MAX_RESTARTS = 5

/** Pool size: 2 on small machines, 3 from 12 hardware threads up. */
export function defaultLodWorkerCount(): number {
  const threads = navigator.hardwareConcurrency || 4
  return threads >= 12 ? 3 : 2
}

/**
 * The LOD worker pool: extra ChunkGenerationWorker instances that only ever
 * receive lod-* messages, so far-terrain work never queues behind (or delays)
 * full-detail generation.
 *
 * Regions are routed stickily - a region's tiles are cached in the worker
 * that built them, and only that worker can mesh the region.
 */
export class LodWorkerPool {
  readonly size: number
  private readonly workers: (Worker | null)[]
  private readonly ready: boolean[]
  private readonly initialized: boolean[]
  private readonly restarts: number[]
  private initMessage: LodInitRequest | null = null
  private disposed = false

  /**
   * @param onLost a worker was lost (crashed, or restarted after stalling):
   *   its in-flight requests will never be answered and its cached tiles are
   *   gone. A replacement starts shortly (isReady/isInitialized turn true again).
   */
  constructor(
    size: number,
    private readonly onResponse: (workerIndex: number, response: LodWorkerResponse) => void,
    private readonly onLost: (workerIndex: number) => void = () => {}
  ) {
    this.size = size
    this.workers = new Array<Worker | null>(size).fill(null)
    this.ready = new Array<boolean>(size).fill(false)
    this.initialized = new Array<boolean>(size).fill(false)
    this.restarts = new Array<number>(size).fill(0)
    for (let i = 0; i < size; i++) {
      setTimeout(() => this.createWorker(i, 1), i * CREATE_STAGGER_MS)
    }
  }

  /** Worker that owns a region: neighbouring regions land on different workers. */
  workerForRegion(regionX: number, regionZ: number): number {
    const n = this.size
    return (((regionX + regionZ) % n) + n) % n
  }

  /** Worker has started and accepts tile requests. */
  isReady(index: number): boolean {
    return this.ready[index]
  }

  /** Worker has the palette and accepts mesh requests. */
  isInitialized(index: number): boolean {
    return this.initialized[index]
  }

  /** Send the palette to every worker (now, or as soon as each is ready). */
  setInitMessage(message: LodInitRequest): void {
    this.initMessage = message
    for (let i = 0; i < this.size; i++) {
      if (this.ready[i]) this.sendInit(i)
    }
  }

  post(index: number, message: LodWorkerRequest, transfer?: Transferable[]): void {
    const worker = this.workers[index]
    if (!worker || !this.ready[index]) {
      throw new Error(`LOD worker ${index} is not ready`)
    }
    if (transfer) worker.postMessage(message, transfer)
    else worker.postMessage(message)
  }

  /**
   * Replace a worker that stopped answering (see LodManager's stall watchdog).
   */
  restart(index: number): void {
    if (this.disposed || !this.workers[index]) return
    this.lose(index, 'stalled')
  }

  dispose(): void {
    this.disposed = true
    for (let i = 0; i < this.size; i++) {
      this.workers[i]?.terminate()
      this.workers[i] = null
      this.ready[i] = false
      this.initialized[i] = false
    }
  }

  private createWorker(index: number, attempt: number): void {
    if (this.disposed) return
    const worker = new Worker(
      new URL('../../workers/ChunkGenerationWorker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (event: MessageEvent<LodWorkerResponse | { type: 'worker-ready' }>) => {
      const data = event.data
      if (data.type === 'worker-ready') {
        this.ready[index] = true
        if (this.initMessage) this.sendInit(index)
        return
      }
      this.onResponse(index, data)
    }
    worker.onerror = (event) => {
      console.error(`[LodWorkerPool] LOD worker ${index} error (attempt ${attempt}):`, event.message)
      if (this.workers[index] !== worker) return
      if (this.ready[index]) {
        // Request errors come back as lod-error messages; an error event from
        // a running worker means requests were lost (uncaught failure, crash)
        this.lose(index, 'crashed')
        return
      }
      worker.terminate()
      this.workers[index] = null
      if (attempt < MAX_CREATE_ATTEMPTS) {
        setTimeout(() => this.createWorker(index, attempt + 1), 500)
      }
    }
    // A reply that can't be deserialized is a lost reply
    worker.onmessageerror = () => {
      if (this.workers[index] === worker && this.ready[index]) this.lose(index, 'lost a message')
    }
    this.workers[index] = worker
  }

  /** Drop a running worker (its requests and cached tiles are gone) and start a replacement. */
  private lose(index: number, reason: string): void {
    this.workers[index]?.terminate()
    this.workers[index] = null
    this.ready[index] = false
    this.initialized[index] = false
    this.onLost(index)
    if (++this.restarts[index] > MAX_RESTARTS) {
      console.error(`[LodWorkerPool] LOD worker ${index} ${reason}; restart limit reached, its regions stop updating`)
      return
    }
    console.warn(`[LodWorkerPool] LOD worker ${index} ${reason}; replacing it`)
    setTimeout(() => this.createWorker(index, 1), RESTART_DELAY_MS)
  }

  private sendInit(index: number): void {
    if (!this.initMessage || this.initialized[index]) return
    this.workers[index]?.postMessage(this.initMessage)
    this.initialized[index] = true
  }
}
