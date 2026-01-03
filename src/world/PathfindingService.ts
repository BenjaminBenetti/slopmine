/**
 * Service for managing pathfinding workers and job queue.
 * Provides a clean API for requesting paths with callbacks.
 */

import type {
  PathfindingPosition,
  PathfindingConfig,
  PathfindingResult,
} from '../world/interfaces/IPathfinding.ts'
import type {
  PathfindingRequest,
  PathfindingResponse,
  PathfindingError,
} from '../workers/PathfindingWorker.ts'

/**
 * Callback function called when pathfinding completes.
 */
export type PathfindingCallback = (result: PathfindingResult) => void

/**
 * A queued pathfinding job.
 */
interface PathfindingJob {
  requestId: string
  request: PathfindingRequest
  callback: PathfindingCallback
  priority: number
  timestamp: number
}

/**
 * Configuration for the pathfinding service.
 */
export interface PathfindingServiceConfig {
  /** Number of worker threads to use (default: 2) */
  workerCount?: number
  /** Enable debug logging (default: false) */
  debug?: boolean
}

const DEFAULT_CONFIG: PathfindingServiceConfig = {
  workerCount: 2,
  debug: false,
}

/**
 * Service for managing pathfinding requests across multiple workers.
 */
export class PathfindingService {
  private readonly config: PathfindingServiceConfig
  private readonly workers: Worker[] = []
  private readonly workerBusy: boolean[] = []
  private readonly jobQueue: PathfindingJob[] = []
  private readonly pendingJobs = new Map<string, PathfindingJob>()
  private nextRequestId = 0

  constructor(config: Partial<PathfindingServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Create worker pool
    const workerCount = this.config.workerCount!
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        new URL('../workers/PathfindingWorker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (event: MessageEvent<PathfindingResponse | PathfindingError>) => {
        this.workerBusy[i] = false
        this.handleWorkerResult(event.data)
        this.processQueue()
      }

      worker.onerror = (error) => {
        console.error(`Pathfinding worker ${i} error:`, error)
        this.workerBusy[i] = false
        this.processQueue()
      }

      this.workers.push(worker)
      this.workerBusy.push(false)
    }

    if (this.config.debug) {
      console.log(`PathfindingService initialized with ${workerCount} workers`)
    }
  }

  /**
   * Request a path from start to goal.
   * The callback will be invoked when the path is computed.
   * 
   * @param start Starting position
   * @param goal Goal position
   * @param blocks Block data covering the relevant area
   * @param dimensions Dimensions of blocks array [width, height, depth]
   * @param offset World coordinate offset for blocks array
   * @param callback Function to call with the result
   * @param config Pathfinding configuration
   * @param priority Higher priority jobs are processed first (default: 0)
   * @returns Request ID that can be used to cancel the request
   */
  findPath(
    start: PathfindingPosition,
    goal: PathfindingPosition,
    blocks: Uint16Array,
    dimensions: [number, number, number],
    offset: PathfindingPosition,
    callback: PathfindingCallback,
    config: PathfindingConfig = {},
    priority: number = 0
  ): string {
    const requestId = this.generateRequestId()

    const request: PathfindingRequest = {
      type: 'findPath',
      requestId,
      start,
      goal,
      blocks: new Uint16Array(blocks), // Copy to avoid shared mutation
      dimensions,
      offset,
      config,
    }

    const job: PathfindingJob = {
      requestId,
      request,
      callback,
      priority,
      timestamp: Date.now(),
    }

    this.jobQueue.push(job)
    this.sortQueue()
    this.processQueue()

    if (this.config.debug) {
      console.log(`Queued pathfinding job ${requestId} with priority ${priority}`)
    }

    return requestId
  }

  /**
   * Cancel a pathfinding request.
   * If the job is queued, it will be removed from the queue.
   * If the job is in progress, the callback will not be invoked when it completes.
   * 
   * @param requestId The request ID returned from findPath
   * @returns true if the request was cancelled, false if not found
   */
  cancel(requestId: string): boolean {
    // Check if it's in the queue
    const queueIndex = this.jobQueue.findIndex(job => job.requestId === requestId)
    if (queueIndex !== -1) {
      this.jobQueue.splice(queueIndex, 1)
      if (this.config.debug) {
        console.log(`Cancelled queued job ${requestId}`)
      }
      return true
    }

    // Check if it's pending (in progress)
    if (this.pendingJobs.has(requestId)) {
      // Can't cancel in-progress job, but remove callback so it won't fire
      this.pendingJobs.delete(requestId)
      if (this.config.debug) {
        console.log(`Cancelled pending job ${requestId}`)
      }
      return true
    }

    return false
  }

  /**
   * Get statistics about the pathfinding service.
   */
  getStats(): {
    queued: number
    processing: number
    workerCount: number
    busyWorkers: number
  } {
    const busyWorkers = this.workerBusy.filter(busy => busy).length
    
    return {
      queued: this.jobQueue.length,
      processing: this.pendingJobs.size,
      workerCount: this.workers.length,
      busyWorkers,
    }
  }

  /**
   * Dispose of the service and terminate all workers.
   */
  dispose(): void {
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.jobQueue.length = 0
    this.pendingJobs.clear()

    if (this.config.debug) {
      console.log('PathfindingService disposed')
    }
  }

  /**
   * Generate a unique request ID.
   */
  private generateRequestId(): string {
    return `pf-${++this.nextRequestId}-${Date.now()}`
  }

  /**
   * Sort the job queue by priority (higher first) and timestamp (older first).
   */
  private sortQueue(): void {
    this.jobQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority // Higher priority first
      }
      return a.timestamp - b.timestamp // Older first
    })
  }

  /**
   * Process the job queue by assigning jobs to available workers.
   */
  private processQueue(): void {
    while (this.jobQueue.length > 0) {
      const workerIndex = this.getAvailableWorker()
      if (workerIndex === -1) {
        // No available workers
        break
      }

      const job = this.jobQueue.shift()!
      this.assignJobToWorker(job, workerIndex)
    }
  }

  /**
   * Get the index of an available worker, or -1 if all busy.
   */
  private getAvailableWorker(): number {
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.workerBusy[i]) {
        return i
      }
    }
    return -1
  }

  /**
   * Assign a job to a worker.
   */
  private assignJobToWorker(job: PathfindingJob, workerIndex: number): void {
    this.workerBusy[workerIndex] = true
    this.pendingJobs.set(job.requestId, job)

    // Transfer the blocks buffer for zero-copy performance
    this.workers[workerIndex].postMessage(job.request, {
      transfer: [job.request.blocks.buffer],
    })

    if (this.config.debug) {
      console.log(`Assigned job ${job.requestId} to worker ${workerIndex}`)
    }
  }

  /**
   * Handle a result from a worker.
   */
  private handleWorkerResult(result: PathfindingResponse | PathfindingError): void {
    const job = this.pendingJobs.get(result.requestId)
    this.pendingJobs.delete(result.requestId)

    if (!job) {
      // Job was cancelled
      if (this.config.debug) {
        console.log(`Received result for cancelled job ${result.requestId}`)
      }
      return
    }

    if (result.type === 'pathError') {
      console.error(`Pathfinding error for ${result.requestId}: ${result.error}`)
      // Invoke callback with failed result
      job.callback({
        success: false,
        path: [],
        cost: 0,
        nodesExplored: 0,
      })
      return
    }

    // Success - invoke callback with result
    if (this.config.debug) {
      console.log(
        `Pathfinding complete for ${result.requestId}: ` +
        `${result.result.success ? 'found' : 'not found'}, ` +
        `nodes: ${result.result.nodesExplored}, ` +
        `path length: ${result.result.path.length}`
      )
    }

    job.callback(result.result)
  }
}
