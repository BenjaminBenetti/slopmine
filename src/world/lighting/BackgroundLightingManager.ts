/**
 * Manages background lighting correction for the world.
 * Periodically re-calculates skylight for chunk columns to fix
 * lighting errors that occur during generation.
 */

import type { IChunkCoordinate, ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../interfaces/ICoordinates.ts'
import type { ChunkColumn } from '../chunks/ChunkColumn.ts'
import type { SubChunk } from '../chunks/SubChunk.ts'
import type {
  LightingRequest,
  LightingResponse,
  LightingError,
  BlockChangeLightingRequest,
  SubChunkData,
} from '../../workers/LightingWorker.ts'
import { SkylightPropagator } from './SkylightPropagator.ts'
import { BlocklightPropagator } from './BlocklightPropagator.ts'
import { SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'

export interface BackgroundLightingConfig {
  /** How many columns to process per update cycle (default: 1) */
  columnsPerUpdate: number
  /** Minimum time between processing the same column again in ms (default: 60000 = 1 minute) */
  reprocessCooldown: number
  /** Minimum time between processing nearby columns in ms (default: 10000 = 10 seconds) */
  nearbyReprocessCooldown: number
  /** Distance in chunks for "nearby" priority processing (default: 4) */
  nearbyDistance: number
  /** Maximum distance in chunks for background processing (default: 12) */
  maxDistance: number
  /** Whether background lighting is enabled (default: true) */
  enabled: boolean
}

const DEFAULT_CONFIG: BackgroundLightingConfig = {
  columnsPerUpdate: 20,
  reprocessCooldown: 10000, // 10 seconds
  nearbyReprocessCooldown: 1000, // 1 seconds
  nearbyDistance: 4,
  maxDistance: 8,
  enabled: true,
}

export class BackgroundLightingManager {
  private readonly config: BackgroundLightingConfig
  private readonly workers: Worker[] = []
  private readonly workerBusy: boolean[] = []
  private readonly WORKER_COUNT = 4
  private workersReady = 0
  private readonly pendingColumns: Map<ChunkKey, ChunkColumn> = new Map()
  private readonly processedColumns: Map<ChunkKey, number> = new Map() // chunkKey -> timestamp
  private readonly columnQueue: ChunkKey[] = []
  private readonly columnQueueSet: Set<ChunkKey> = new Set() // Fast O(1) lookup for queue membership

  // Pending queue - columns waiting to be added to main queue (throttled to 1/frame)
  private readonly pendingAddQueue: ChunkKey[] = []

  // High-priority queue for block changes when workers are busy
  private readonly blockChangeQueue: BlockChangeLightingRequest[] = []
  // Column keys with a request already sitting in blockChangeQueue, so repeat block
  // changes to the same column coalesce instead of re-serializing the whole column.
  private readonly blockChangeQueueKeys: Set<ChunkKey> = new Set()

  // Pending force remesh sub-chunks (for when block change requests are skipped due to pending column)
  private readonly pendingForceRemesh: Map<ChunkKey, Set<number>> = new Map()

  // Edge propagation queue - columns needing light from neighbors
  private readonly edgePropagationQueue: Set<ChunkKey> = new Set()
  private readonly skylightPropagator = new SkylightPropagator()
  private readonly blocklightPropagator = new BlocklightPropagator()

  // Frame budget for edge propagation (in milliseconds)
  private readonly EDGE_PROPAGATION_BUDGET_MS = 2

  // Cooldown for edge propagation to prevent cascading re-queueing
  private readonly recentlyPropagated: Map<ChunkKey, number> = new Map()
  private readonly PROPAGATION_COOLDOWN_MS = 500

  // Neighbors whose edge-propagation enqueue was skipped by the cooldown, mapped to the
  // earliest time they may be retried. Without this, a neighbor lit just before this column
  // (e.g. two columns generated <500ms apart) would silently never receive its border light,
  // since nothing re-enqueues it once the periodic re-queue safety net is gone.
  private readonly deferredEdgePropagation: Map<ChunkKey, number> = new Map()

  // Player position for priority processing (in chunk coordinates)
  private playerChunkX = 0
  private playerChunkZ = 0

  // Pre-allocated stats object to avoid GC pressure
  private readonly statsResult = { queued: 0, processing: 0 }
  private statsLastUpdate = 0
  private readonly STATS_UPDATE_INTERVAL_MS = 500 // Only recalculate stats every 500ms

  // Pre-allocated transfer array to avoid flatMap allocation (max 16 sub-chunks * 2 buffers)
  private readonly transfersPool: ArrayBuffer[] = []

  // Callbacks for when lighting is updated
  private readonly onSubChunkLightingUpdated: Array<(coord: ISubChunkCoordinate) => void> = []

  // Callbacks for when a column starts being lit
  private readonly onColumnLightingStarted: Array<(coord: IChunkCoordinate) => void> = []

  // Reference to get columns and queue remeshing
  private getColumn: ((coord: IChunkCoordinate) => ChunkColumn | undefined) | null = null
  private queueSubChunkForMeshing: ((subChunk: SubChunk, priority?: 'high' | 'normal', forceRequeue?: boolean) => void) | null = null

  constructor(config: Partial<BackgroundLightingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Stagger worker creation to avoid browser limits
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      this.workers.push(null as unknown as Worker) // Placeholder
      this.workerBusy.push(false)
      setTimeout(() => this.createLightingWorker(i), i * 100 + 400) // Start after generation workers
    }
  }

  /**
   * Create a single lighting worker with retry logic.
   */
  private createLightingWorker(index: number, retryCount = 0): void {
    const worker = new Worker(
      new URL('../../workers/LightingWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (event: MessageEvent<LightingResponse | LightingError | { type: 'worker-ready' }>) => {
      if (event.data.type === 'worker-ready') {
        this.workersReady++
        console.log(`[WorldManager] Lighting worker ${index} ready (${this.workersReady}/${this.WORKER_COUNT})`)
        return
      }
      this.workerBusy[index] = false
      this.handleWorkerResult(event.data)
      // Process any queued block changes immediately (high priority)
      this.processBlockChangeQueue()
    }

    worker.onerror = (event) => {
      const errorEvent = event as ErrorEvent
      console.error(`[LightingWorker ${index}] error (attempt ${retryCount + 1}):`, {
        message: errorEvent.message,
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
      })
      this.workerBusy[index] = false
      // Retry after delay
      if (retryCount < 2) {
        setTimeout(() => this.createLightingWorker(index, retryCount + 1), 500)
      }
    }

    this.workers[index] = worker
  }

  /**
   * Set the callbacks for column access and remeshing.
   * Must be called before processing can begin.
   */
  setCallbacks(
    getColumn: (coord: IChunkCoordinate) => ChunkColumn | undefined,
    queueSubChunkForMeshing: (subChunk: SubChunk, priority?: 'high' | 'normal', forceRequeue?: boolean) => void
  ): void {
    this.getColumn = getColumn
    this.queueSubChunkForMeshing = queueSubChunkForMeshing
  }

  /**
   * Register a callback for when sub-chunk lighting is updated.
   */
  onLightingUpdated(callback: (coord: ISubChunkCoordinate) => void): () => void {
    this.onSubChunkLightingUpdated.push(callback)
    return () => {
      const index = this.onSubChunkLightingUpdated.indexOf(callback)
      if (index !== -1) {
        this.onSubChunkLightingUpdated.splice(index, 1)
      }
    }
  }

  /**
   * Register a callback for when a column starts being lit.
   */
  onLightingStarted(callback: (coord: IChunkCoordinate) => void): () => void {
    this.onColumnLightingStarted.push(callback)
    return () => {
      const index = this.onColumnLightingStarted.indexOf(callback)
      if (index !== -1) {
        this.onColumnLightingStarted.splice(index, 1)
      }
    }
  }

  /**
   * Add a chunk column to the processing queue.
   * Called when a new chunk column is generated.
   * Columns are added to a pending queue and throttled to 1/frame to avoid stuttering.
   */
  queueColumn(coordinate: IChunkCoordinate): void {
    if (!this.config.enabled) return

    const key = createChunkKey(coordinate.x, coordinate.z)

    // Don't queue if already in queue or pending
    if (this.columnQueueSet.has(key)) return

    // Add to pending queue - will be moved to main queue 1/frame
    this.pendingAddQueue.push(key)
    this.columnQueueSet.add(key) // Mark as "in queue" to prevent duplicates
  }

  /**
   * Queue a block change for lighting update.
   * This sends the request directly to the worker (high priority).
   * The result will trigger remeshing via existing callbacks.
   *
   * @param column The chunk column containing the changed block
   * @param localX Local X coordinate (0-31)
   * @param localY Local Y coordinate in column (0-1023)
   * @param localZ Local Z coordinate (0-31)
   * @param wasBlockRemoved True if block was removed (air placed), false if block was placed
   */
  queueBlockChange(
    column: ChunkColumn,
    localX: number,
    localY: number,
    localZ: number,
    wasBlockRemoved: boolean
  ): void {
    const coord = column.coordinate
    const key = createChunkKey(coord.x, coord.z)

    // Calculate which sub-chunk contains the block change
    const subY = Math.floor(localY / SUB_CHUNK_HEIGHT)

    // If there's already a pending request for this column, store the subY
    // for forced remeshing when the pending request completes
    if (this.pendingColumns.has(key)) {
      let pending = this.pendingForceRemesh.get(key)
      if (!pending) {
        pending = new Set()
        this.pendingForceRemesh.set(key, pending)
      }
      pending.add(subY)
      return
    }

    // A serialized request for this column is already waiting for a free worker. Don't
    // re-serialize the whole column (~1.5MB) — just record the sub-chunk to force-remesh
    // when that queued request completes, mirroring the in-flight case above. This stops
    // block-placement bursts (e.g. tree decoration) from copying the column per block.
    if (this.blockChangeQueueKeys.has(key)) {
      let pending = this.pendingForceRemesh.get(key)
      if (!pending) {
        pending = new Set()
        this.pendingForceRemesh.set(key, pending)
      }
      pending.add(subY)
      return
    }

    const subChunks = this.serializeSubChunks(column)
    if (subChunks.length === 0) return

    const request: BlockChangeLightingRequest = {
      type: 'update-block-lighting',
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      localX,
      localY,
      localZ,
      wasBlockRemoved,
      subChunks,
      forceRemeshSubY: subY,
      skylightValue: column.skylightValue,
    }

    // Find an available worker for high-priority block change
    const workerIndex = this.getAvailableWorker()
    if (workerIndex === -1) {
      // All workers busy - queue for later processing
      this.blockChangeQueue.push(request)
      this.blockChangeQueueKeys.add(key)
      return
    }

    // Track this as a pending column update
    this.pendingColumns.set(key, column)

    // Transfer buffers to worker (reuse pool to avoid flatMap allocation)
    this.workerBusy[workerIndex] = true
    this.transfersPool.length = 0
    for (const sc of subChunks) {
      this.transfersPool.push(sc.blocks.buffer as ArrayBuffer, sc.lightData.buffer as ArrayBuffer)
    }
    this.workers[workerIndex].postMessage(request, this.transfersPool)
  }

  /**
   * Process queued block changes when workers become available.
   * Called after a worker finishes to immediately process high-priority block changes.
   */
  private processBlockChangeQueue(): void {
    while (this.blockChangeQueue.length > 0) {
      const workerIndex = this.getAvailableWorker()
      if (workerIndex === -1) break // No more available workers

      const request = this.blockChangeQueue.shift()!
      const key = createChunkKey(BigInt(request.chunkX), BigInt(request.chunkZ))
      this.blockChangeQueueKeys.delete(key)

      // Skip if column is already being processed
      if (this.pendingColumns.has(key)) continue

      // Get column reference for pendingColumns tracking
      const column = this.getColumn?.({ x: BigInt(request.chunkX), z: BigInt(request.chunkZ) })
      if (!column) continue

      this.pendingColumns.set(key, column)
      this.workerBusy[workerIndex] = true
      this.transfersPool.length = 0
      for (const sc of request.subChunks) {
        this.transfersPool.push(sc.blocks.buffer as ArrayBuffer, sc.lightData.buffer as ArrayBuffer)
      }
      this.workers[workerIndex].postMessage(request, this.transfersPool)
    }
  }

  /**
   * Serialize sub-chunks from a column for worker transfer.
   * Must copy arrays since SubChunk needs to retain its data after transfer.
   * Includes per-sub-chunk skylightValue for layer-aware lighting.
   */
  private serializeSubChunks(column: ChunkColumn): SubChunkData[] {
    const subChunks: SubChunkData[] = []

    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        subChunks.push({
          subY,
          blocks: new Uint16Array(subChunk.getBlockData()),
          lightData: new Uint8Array(subChunk.getLightData()),
          skylightValue: subChunk.skylightValue,
        })
      }
    }

    return subChunks
  }

  /**
   * Remove a chunk column from tracking when it's unloaded.
   */
  unloadColumn(coordinate: IChunkCoordinate): void {
    const key = createChunkKey(coordinate.x, coordinate.z)

    // Remove from queue and Set
    const queueIndex = this.columnQueue.indexOf(key)
    if (queueIndex !== -1) {
      this.columnQueue.splice(queueIndex, 1)
    }
    this.columnQueueSet.delete(key)

    // Also remove from pending add queue
    const pendingIndex = this.pendingAddQueue.indexOf(key)
    if (pendingIndex !== -1) {
      this.pendingAddQueue.splice(pendingIndex, 1)
    }

    // Remove from pending and processed tracking
    this.pendingColumns.delete(key)
    this.processedColumns.delete(key)

    // Clean up pending force remesh entries
    this.pendingForceRemesh.delete(key)

    // Drop any deferred edge-propagation retry for this column
    this.deferredEdgePropagation.delete(key)

    // Drop any queued block-change request for this column
    if (this.blockChangeQueueKeys.delete(key)) {
      const cx = Number(coordinate.x)
      const cz = Number(coordinate.z)
      for (let i = this.blockChangeQueue.length - 1; i >= 0; i--) {
        const req = this.blockChangeQueue[i]
        if (req.chunkX === cx && req.chunkZ === cz) {
          this.blockChangeQueue.splice(i, 1)
        }
      }
    }
  }

  /**
   * Update the player position for priority processing.
   * Call this each frame with the player's world position.
   */
  setPlayerPosition(worldX: number, worldZ: number): void {
    // Convert world position to chunk coordinates
    this.playerChunkX = Math.floor(worldX / 32)
    this.playerChunkZ = Math.floor(worldZ / 32)
  }

  /**
   * Update the background lighting system.
   * Call this each frame to process queued columns.
   */
  update(): void {
    this.updateQueue()
    // Process up to columnsPerUpdate columns
    for (let i = 0; i < this.config.columnsPerUpdate; i++) {
      if (!this.processNextColumn()) break
    }
  }

  /**
   * Update the lighting queue (move pending columns, process edge propagation).
   * Does NOT process columns - use processNextColumn() for that.
   * Call this every frame to keep the queue up to date.
   */
  updateQueue(): void {
    if (!this.config.enabled) return
    if (!this.getColumn || !this.queueSubChunkForMeshing) return

    // Throttle: move 1 pending column to the main queue per frame
    if (this.pendingAddQueue.length > 0) {
      const key = this.pendingAddQueue.shift()!
      this.columnQueue.push(key)
    }

    // Re-arm any edge-propagation requests whose cooldown has now expired before processing.
    this.flushDeferredEdgePropagation()

    // Process edge propagation (spreads light across chunk borders)
    this.processEdgePropagation()
  }

  /**
   * Process a single column from the queue.
   * Used by the task scheduler for budget-aware processing.
   * @returns true if a column was processed (more work may remain), false if no work done
   */
  processNextColumn(): boolean {
    if (!this.config.enabled) return false
    if (!this.getColumn || !this.queueSubChunkForMeshing) return false
    if (this.columnQueue.length === 0) return false

    const now = Date.now()
    let attempts = 0
    const maxAttempts = this.columnQueue.length

    while (attempts < maxAttempts) {
      attempts++

      // Pick a random index from the queue
      const randomIndex = Math.floor(Math.random() * this.columnQueue.length)
      const key = this.columnQueue[randomIndex]

      // Parse chunk coordinates to check distance
      const [xStr, zStr] = key.split(',')
      const chunkX = Number(xStr)
      const chunkZ = Number(zStr)

      // Calculate distance from player
      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distance = Math.sqrt(dx * dx + dz * dz)

      // Skip chunks beyond max distance
      if (distance > this.config.maxDistance) {
        continue
      }

      // Use shorter cooldown for nearby chunks
      const isNearby = distance <= this.config.nearbyDistance
      const baseCooldown = isNearby ? this.config.nearbyReprocessCooldown : this.config.reprocessCooldown

      // Add jitter to stagger reprocessing (deterministic based on chunk coords)
      // Nearby chunks use higher jitter (0-100%) to spread across full window
      // Far chunks use lower jitter (0-50%) for less variation
      const jitterSeed = (chunkX * 73856093) ^ (chunkZ * 19349663)
      const jitterPercent = isNearby
        ? (Math.abs(jitterSeed) % 100) / 100
        : (Math.abs(jitterSeed) % 50) / 100
      const cooldown = baseCooldown + baseCooldown * jitterPercent

      // Check if this column was recently processed
      const lastProcessed = this.processedColumns.get(key)
      if (lastProcessed && now - lastProcessed < cooldown) {
        continue
      }

      // Check if already pending
      if (this.pendingColumns.has(key)) {
        this.columnQueue.splice(randomIndex, 1)
        this.columnQueueSet.delete(key)
        continue
      }

      // Get the column
      const coord: IChunkCoordinate = { x: BigInt(xStr), z: BigInt(zStr) }
      const column = this.getColumn(coord)

      if (!column) {
        // Column no longer exists, remove from queue
        this.columnQueue.splice(randomIndex, 1)
        this.columnQueueSet.delete(key)
        this.processedColumns.delete(key)
        continue
      }

      // Send to worker - only remove from queue if successfully sent
      if (this.sendColumnToWorker(column, key)) {
        this.columnQueue.splice(randomIndex, 1)
        this.columnQueueSet.delete(key)
        return true // Successfully processed one column
      } else {
        // All workers busy - stop trying
        return false
      }
    }

    return false // No valid column found after all attempts
  }

  /**
   * Check if there is lighting work pending.
   */
  hasWorkPending(): boolean {
    return this.columnQueue.length > 0 || this.pendingAddQueue.length > 0 || this.edgePropagationQueue.size > 0
  }

  /**
   * Send a column to the worker for lighting recalculation.
   * @returns true if sent successfully, false if no worker available
   */
  private sendColumnToWorker(column: ChunkColumn, key: ChunkKey): boolean {
    const coord = column.coordinate
    const subChunks = this.serializeSubChunks(column)

    if (subChunks.length === 0) {
      // No sub-chunks to process - consider this "success" to remove from queue
      return true
    }

    // Find an available worker first - don't mark as pending until we can actually send
    const workerIndex = this.getAvailableWorker()
    if (workerIndex === -1) return false // All workers busy, will retry next update

    // Notify listeners that lighting is starting for this column
    for (const callback of this.onColumnLightingStarted) {
      callback(coord)
    }

    const request: LightingRequest = {
      type: 'recalculate-column',
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      subChunks,
      skylightValue: column.skylightValue,
    }

    // Only mark as pending AFTER we confirmed a worker is available
    this.pendingColumns.set(key, column)
    this.workerBusy[workerIndex] = true
    // Reuse pool to avoid flatMap allocation
    this.transfersPool.length = 0
    for (const sc of subChunks) {
      this.transfersPool.push(sc.blocks.buffer as ArrayBuffer, sc.lightData.buffer as ArrayBuffer)
    }
    this.workers[workerIndex].postMessage(request, this.transfersPool)

    return true
  }

  /**
   * Get index of an available worker, or -1 if all busy or not yet created.
   */
  private getAvailableWorker(): number {
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      // Check worker exists (not null placeholder) and is not busy
      if (this.workers[i] && !this.workerBusy[i]) {
        return i
      }
    }
    return -1
  }

  /**
   * Handle result from the lighting worker.
   */
  private handleWorkerResult(result: LightingResponse | LightingError): void {
    const key = createChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ))
    const column = this.pendingColumns.get(key)
    this.pendingColumns.delete(key)

    if (result.type === 'lighting-error') {
      console.warn(`Background lighting error for chunk ${result.chunkX},${result.chunkZ}: ${result.error}`)
      return
    }

    if (!column) {
      // Column was unloaded while processing
      return
    }

    // Mark as processed (drives the reprocess cooldown while a column is briefly
    // re-queued as its sub-chunks stream in during generation).
    this.processedColumns.set(key, Date.now())

    // NOTE: columns are deliberately NOT re-queued here. Re-lighting is event-driven —
    // a column is (re)lit only when it is generated/loaded (queueColumn), when a block
    // changes in it (queueBlockChange), or when a neighbor's border light actually changes
    // (the edge-propagation queue below). Unconditional re-queueing previously kept every
    // nearby column relighting every ~1-2s forever, so an idle world never quiesced.

    // First pass: Apply ALL light data before queueing any meshes
    // (meshes need neighbor light data, so all light must be updated first)
    const changedSubChunks: SubChunk[] = []
    for (const updated of result.updatedSubChunks) {
      if (!updated.changed) continue

      const subChunk = column.getSubChunk(updated.subY)
      if (!subChunk) continue

      // Apply the new light data - worker results are authoritative
      const currentLightData = subChunk.getLightData()
      currentLightData.set(updated.lightData)

      changedSubChunks.push(subChunk)
    }

    // Immediately propagate light FROM neighbors INTO this column, restoring edge light
    // that the column recompute cleared before we remesh. Skip entirely when nothing
    // changed: a no-op result already has correct borders and needs no propagation work.
    const hadLightChange = changedSubChunks.length > 0
    if (hadLightChange) {
      this.propagateFromNeighborsImmediately(column.coordinate)
    }

    // Second pass: Queue all changed sub-chunks for remeshing
    // (now all neighbor light data is correct)
    const queuedSubYs = new Set<number>()
    for (const subChunk of changedSubChunks) {
      if (this.queueSubChunkForMeshing) {
        this.queueSubChunkForMeshing(subChunk, 'high')
        queuedSubYs.add(subChunk.coordinate.subY)
      }

      // Notify listeners
      const coord: ISubChunkCoordinate = {
        x: column.coordinate.x,
        z: column.coordinate.z,
        subY: subChunk.coordinate.subY,
      }
      for (const callback of this.onSubChunkLightingUpdated) {
        callback(coord)
      }
    }

    // Third pass: Force remesh for sub-chunks that had block changes
    // (even if lighting didn't change, block data did)
    const forceRemeshSubYs = new Set<number>()

    // From response (direct block change request)
    if (result.forceRemeshSubY !== undefined) {
      forceRemeshSubYs.add(result.forceRemeshSubY)
    }

    // From pending map (block changes that were skipped due to pending column).
    // These were coalesced into a remesh-only path while this column's lighting job
    // was in flight (or queued), so their lighting was NEVER computed - the incremental
    // update-block-lighting only propagated from the one block this job carried.
    const pendingForce = this.pendingForceRemesh.get(key)
    const hadCoalescedChanges = pendingForce !== undefined && pendingForce.size > 0
    if (pendingForce) {
      for (const subY of pendingForce) {
        forceRemeshSubYs.add(subY)
      }
      this.pendingForceRemesh.delete(key)
    }

    // Coalesced block changes force-remeshed above but were never actually lit. Re-queue
    // this column for a full recalculate-column (source rescan) so newly-placed light
    // sources / blockers propagate. Clear the reprocess cooldown just set above so it runs
    // promptly. This terminates: the follow-up job finds pendingForceRemesh empty.
    if (hadCoalescedChanges) {
      this.processedColumns.delete(key)
      if (!this.columnQueueSet.has(key)) {
        this.columnQueueSet.add(key)
        this.columnQueue.push(key)
      }
    }

    // Force remesh these sub-chunks if not already queued by lighting pass
    for (const subY of forceRemeshSubYs) {
      if (!queuedSubYs.has(subY)) {
        const subChunk = column.getSubChunk(subY)
        if (subChunk && this.queueSubChunkForMeshing) {
          this.queueSubChunkForMeshing(subChunk, 'high')
        }
      }
    }

    // For block changes (forceRemeshSubY present), do immediate edge propagation
    // This ensures torch light spreads to neighbors instantly, not after background update
    if (result.forceRemeshSubY !== undefined) {
      this.propagateToNeighborsImmediately(column.coordinate)
    }

    // Queue neighbors for edge propagation to spread light across chunk borders — but only
    // when this column's light actually changed (or a block changed in it). This difference
    // check is what terminates the cross-border convergence cascade: a neighbor is re-lit
    // only when the light reaching its border truly moved, so an idle world settles instead
    // of ping-ponging edge updates between adjacent columns forever.
    if (hadLightChange || forceRemeshSubYs.size > 0) {
      this.queueNeighborsForEdgePropagation(column.coordinate)
    }
  }

  /**
   * Immediately propagate light to all 4 neighboring chunks.
   * Used after block changes to ensure instant light updates across chunk borders.
   */
  private propagateToNeighborsImmediately(coord: IChunkCoordinate): void {
    if (!this.getColumn || !this.queueSubChunkForMeshing) return

    const sourceColumn = this.getColumn(coord)
    if (!sourceColumn) return

    const neighborDirs: Array<{ dx: bigint; dz: bigint; dir: 'posX' | 'negX' | 'posZ' | 'negZ' }> = [
      { dx: 1n, dz: 0n, dir: 'negX' },  // neighbor at +X receives from our +X edge (their -X)
      { dx: -1n, dz: 0n, dir: 'posX' }, // neighbor at -X receives from our -X edge (their +X)
      { dx: 0n, dz: 1n, dir: 'negZ' },  // neighbor at +Z receives from our +Z edge (their -Z)
      { dx: 0n, dz: -1n, dir: 'posZ' }, // neighbor at -Z receives from our -Z edge (their +Z)
    ]

    for (const { dx, dz, dir } of neighborDirs) {
      const neighborCoord: IChunkCoordinate = { x: coord.x + dx, z: coord.z + dz }
      const neighborColumn = this.getColumn(neighborCoord)
      if (!neighborColumn) continue

      // Propagate from source to neighbor for each sub-chunk
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const sourceSub = sourceColumn.getSubChunk(subY)
        const targetSub = neighborColumn.getSubChunk(subY)
        if (!sourceSub || !targetSub) continue

        // Propagate skylight (cap at target biome's max skylight)
        const skylightChanged = this.skylightPropagator.propagateFromNeighborSubChunk(
          targetSub,
          sourceSub,
          dir,
          neighborColumn.skylightValue
        )

        // Clear blocklight that may have come from a now-removed source in neighbor
        // (handles torch removal across chunk boundaries)
        const blocklightCleared = this.blocklightPropagator.clearFromNeighborSubChunk(
          targetSub,
          sourceSub,
          dir
        )

        // Propagate blocklight from neighbor (handles torch placement)
        const blocklightPropagated = this.blocklightPropagator.propagateFromNeighborSubChunk(
          targetSub,
          sourceSub,
          dir
        )

        if (skylightChanged || blocklightCleared || blocklightPropagated) {
          // Force requeue to ensure mesh uses updated light data from edge propagation
          this.queueSubChunkForMeshing(targetSub, 'high', true)
        }
      }
    }
  }

  /**
   * Immediately receive light FROM all 4 neighboring chunks INTO this chunk.
   * Used after worker results to restore edge light that was cleared before remeshing.
   */
  private propagateFromNeighborsImmediately(coord: IChunkCoordinate): void {
    if (!this.getColumn) return

    const targetColumn = this.getColumn(coord)
    if (!targetColumn) return

    const neighborDirs: Array<{ dx: bigint; dz: bigint; dir: 'posX' | 'negX' | 'posZ' | 'negZ' }> = [
      { dx: 1n, dz: 0n, dir: 'posX' },  // neighbor at +X → light comes from posX
      { dx: -1n, dz: 0n, dir: 'negX' }, // neighbor at -X → light comes from negX
      { dx: 0n, dz: 1n, dir: 'posZ' },  // neighbor at +Z → light comes from posZ
      { dx: 0n, dz: -1n, dir: 'negZ' }, // neighbor at -Z → light comes from negZ
    ]

    for (const { dx, dz, dir } of neighborDirs) {
      const neighborCoord: IChunkCoordinate = { x: coord.x + dx, z: coord.z + dz }
      const neighborColumn = this.getColumn(neighborCoord)
      if (!neighborColumn) continue

      // Propagate from neighbor to target for each sub-chunk
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const targetSub = targetColumn.getSubChunk(subY)
        const sourceSub = neighborColumn.getSubChunk(subY)
        if (!targetSub || !sourceSub) continue

        // Propagate skylight from neighbor (cap at target biome's max skylight)
        this.skylightPropagator.propagateFromNeighborSubChunk(
          targetSub,
          sourceSub,
          dir,
          targetColumn.skylightValue
        )

        // Propagate blocklight from neighbor
        this.blocklightPropagator.propagateFromNeighborSubChunk(
          targetSub,
          sourceSub,
          dir
        )
      }
    }
  }

  /**
   * Queue neighboring columns for edge light propagation.
   * Uses cooldown to prevent cascading re-queueing which causes frame drops.
   */
  private queueNeighborsForEdgePropagation(coord: IChunkCoordinate): void {
    const now = Date.now()

    // Clean old cooldown entries periodically
    if (this.recentlyPropagated.size > 100) {
      for (const [key, time] of this.recentlyPropagated) {
        if (now - time > this.PROPAGATION_COOLDOWN_MS) {
          this.recentlyPropagated.delete(key)
        }
      }
    }

    const neighbors = [
      createChunkKey(coord.x + 1n, coord.z),
      createChunkKey(coord.x - 1n, coord.z),
      createChunkKey(coord.x, coord.z + 1n),
      createChunkKey(coord.x, coord.z - 1n),
    ]

    for (const neighborKey of neighbors) {
      // Skip if recently propagated (prevents cascading), but remember to retry once the
      // cooldown lapses so the request is deferred, not silently dropped forever.
      const lastTime = this.recentlyPropagated.get(neighborKey)
      if (lastTime && now - lastTime < this.PROPAGATION_COOLDOWN_MS) {
        this.deferEdgePropagation(neighborKey, lastTime + this.PROPAGATION_COOLDOWN_MS)
        continue
      }

      this.edgePropagationQueue.add(neighborKey)
      this.recentlyPropagated.set(neighborKey, now)
      this.deferredEdgePropagation.delete(neighborKey)
    }

    // Also add the source column itself (it may receive light from neighbors)
    const sourceKey = createChunkKey(coord.x, coord.z)
    const sourceLastTime = this.recentlyPropagated.get(sourceKey)
    if (!sourceLastTime || now - sourceLastTime >= this.PROPAGATION_COOLDOWN_MS) {
      this.edgePropagationQueue.add(sourceKey)
      this.recentlyPropagated.set(sourceKey, now)
      this.deferredEdgePropagation.delete(sourceKey)
    } else {
      this.deferEdgePropagation(sourceKey, sourceLastTime + this.PROPAGATION_COOLDOWN_MS)
    }
  }

  /**
   * Record a cooldown-skipped edge-propagation request to retry once its cooldown lapses.
   * Keeps the earliest retry time so an actively-touched key can't be pushed out forever.
   */
  private deferEdgePropagation(key: ChunkKey, retryAt: number): void {
    const existing = this.deferredEdgePropagation.get(key)
    if (existing === undefined || retryAt < existing) {
      this.deferredEdgePropagation.set(key, retryAt)
    }
  }

  /**
   * Move deferred edge-propagation requests whose cooldown has expired back into the queue.
   * Called each frame so cross-border light convergence still completes without the old
   * unconditional re-queue safety net.
   */
  private flushDeferredEdgePropagation(): void {
    if (this.deferredEdgePropagation.size === 0) return
    const now = Date.now()
    for (const [key, retryAt] of this.deferredEdgePropagation) {
      if (now >= retryAt) {
        this.edgePropagationQueue.add(key)
        this.recentlyPropagated.set(key, now)
        this.deferredEdgePropagation.delete(key)
      }
    }
  }

  /**
   * Process edge propagation - spread light across chunk borders.
   * Runs on main thread with a time budget to prevent frame spikes.
   */
  private processEdgePropagation(): void {
    if (!this.getColumn || !this.queueSubChunkForMeshing) return
    if (this.edgePropagationQueue.size === 0) return

    const startTime = performance.now()

    for (const key of this.edgePropagationQueue) {
      // Check budget before processing each column
      if (performance.now() - startTime > this.EDGE_PROPAGATION_BUDGET_MS) {
        break // Continue next frame
      }

      this.edgePropagationQueue.delete(key)

      // Parse the key to get coordinates
      const [xStr, zStr] = key.split(',')
      const coord: IChunkCoordinate = { x: BigInt(xStr), z: BigInt(zStr) }
      const column = this.getColumn(coord)
      if (!column) continue

      // Get light from all 4 neighbors
      const neighborDirs: Array<{ dx: bigint; dz: bigint; dir: 'posX' | 'negX' | 'posZ' | 'negZ' }> = [
        { dx: 1n, dz: 0n, dir: 'posX' },  // neighbor at +X → light comes from posX
        { dx: -1n, dz: 0n, dir: 'negX' }, // neighbor at -X → light comes from negX
        { dx: 0n, dz: 1n, dir: 'posZ' },  // neighbor at +Z → light comes from posZ
        { dx: 0n, dz: -1n, dir: 'negZ' }, // neighbor at -Z → light comes from negZ
      ]

      // Track if any light changed in this column
      let columnChanged = false

      for (const { dx, dz, dir } of neighborDirs) {
        const neighborCoord: IChunkCoordinate = { x: coord.x + dx, z: coord.z + dz }
        const neighborColumn = this.getColumn(neighborCoord)
        if (!neighborColumn) continue

        // Propagate from neighbor to target for each sub-chunk
        for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
          const targetSub = column.getSubChunk(subY)
          const sourceSub = neighborColumn.getSubChunk(subY)
          if (!targetSub || !sourceSub) continue

          // Propagate skylight (cap at target biome's max skylight)
          const skylightChanged = this.skylightPropagator.propagateFromNeighborSubChunk(
            targetSub,
            sourceSub,
            dir,
            column.skylightValue
          )

          // Propagate blocklight
          const blocklightChanged = this.blocklightPropagator.propagateFromNeighborSubChunk(
            targetSub,
            sourceSub,
            dir
          )

          if (skylightChanged || blocklightChanged) {
            this.queueSubChunkForMeshing(targetSub)
            columnChanged = true
          }
        }
      }

      // If light changed in this column, queue its neighbors for further propagation
      // This allows light to flow across multiple chunk boundaries
      if (columnChanged) {
        this.queueNeighborsForEdgePropagation(coord)
      }
    }
  }

  /**
   * Get statistics about the background lighting system.
   * Caches results and only recalculates periodically to avoid per-frame overhead.
   */
  getStats(): {
    queued: number
    processing: number
  } {
    const now = Date.now()

    // Always update processing count (cheap)
    this.statsResult.processing = this.pendingColumns.size

    // Only recalculate queued count periodically (expensive)
    if (now - this.statsLastUpdate < this.STATS_UPDATE_INTERVAL_MS) {
      return this.statsResult
    }
    this.statsLastUpdate = now

    // Count columns that are actually ready to process
    let readyCount = 0
    for (const key of this.columnQueue) {
      if (this.pendingColumns.has(key)) continue

      const commaIdx = key.indexOf(',')
      const chunkX = Number(key.slice(0, commaIdx))
      const chunkZ = Number(key.slice(commaIdx + 1))
      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distSq = dx * dx + dz * dz
      const maxDistSq = this.config.maxDistance * this.config.maxDistance

      if (distSq > maxDistSq) continue

      const isNearby = distSq <= this.config.nearbyDistance * this.config.nearbyDistance
      const baseCooldown = isNearby ? this.config.nearbyReprocessCooldown : this.config.reprocessCooldown
      const jitterSeed = (chunkX * 73856093) ^ (chunkZ * 19349663)
      const jitterPercent = isNearby
        ? (Math.abs(jitterSeed) % 100) / 100
        : (Math.abs(jitterSeed) % 50) / 100
      const cooldown = baseCooldown + baseCooldown * jitterPercent
      const lastProcessed = this.processedColumns.get(key)
      if (lastProcessed && now - lastProcessed < cooldown) continue

      readyCount++
    }

    this.statsResult.queued = readyCount
    return this.statsResult
  }

  /**
   * Enable or disable background lighting.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  /**
   * Dispose of the manager and terminate all workers.
   */
  dispose(): void {
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.pendingColumns.clear()
    this.processedColumns.clear()
    this.columnQueue.length = 0
    this.columnQueueSet.clear()
    this.pendingAddQueue.length = 0
    this.blockChangeQueue.length = 0
    this.blockChangeQueueKeys.clear()
    this.edgePropagationQueue.clear()
    this.deferredEdgePropagation.clear()
    this.onSubChunkLightingUpdated.length = 0
  }
}
