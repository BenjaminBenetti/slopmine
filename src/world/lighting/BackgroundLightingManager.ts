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
  reprocessCooldown: 60000, // 1 minute
  nearbyReprocessCooldown: 10000, // 30 seconds
  nearbyDistance: 4,
  maxDistance: 8,
  enabled: true,
}

export class BackgroundLightingManager {
  private readonly config: BackgroundLightingConfig
  private readonly workers: Worker[] = []
  private readonly workerBusy: boolean[] = []
  private readonly WORKER_COUNT = 4
  private readonly pendingColumns: Map<ChunkKey, ChunkColumn> = new Map()
  private readonly processedColumns: Map<ChunkKey, number> = new Map() // chunkKey -> timestamp
  private readonly columnQueue: ChunkKey[] = []
  private readonly columnQueueSet: Set<ChunkKey> = new Set() // Fast O(1) lookup for queue membership

  // Pending queue - columns waiting to be added to main queue (throttled to 1/frame)
  private readonly pendingAddQueue: ChunkKey[] = []

  // Edge propagation queue - columns needing light from neighbors
  private readonly edgePropagationQueue: Set<ChunkKey> = new Set()
  private readonly skylightPropagator = new SkylightPropagator()

  // Player position for priority processing (in chunk coordinates)
  private playerChunkX = 0
  private playerChunkZ = 0

  // Callbacks for when lighting is updated
  private readonly onSubChunkLightingUpdated: Array<(coord: ISubChunkCoordinate) => void> = []

  // Callbacks for when a column starts being lit
  private readonly onColumnLightingStarted: Array<(coord: IChunkCoordinate) => void> = []

  // Reference to get columns and queue remeshing
  private getColumn: ((coord: IChunkCoordinate) => ChunkColumn | undefined) | null = null
  private queueSubChunkForMeshing: ((subChunk: SubChunk) => void) | null = null

  constructor(config: Partial<BackgroundLightingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Create pool of lighting workers
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('../../workers/LightingWorker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (event: MessageEvent<LightingResponse | LightingError>) => {
        this.workerBusy[i] = false
        this.handleWorkerResult(event.data)
      }

      this.workers.push(worker)
      this.workerBusy.push(false)
    }
  }

  /**
   * Set the callbacks for column access and remeshing.
   * Must be called before processing can begin.
   */
  setCallbacks(
    getColumn: (coord: IChunkCoordinate) => ChunkColumn | undefined,
    queueSubChunkForMeshing: (subChunk: SubChunk) => void
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

    // If there's already a pending request for this column, skip
    // The background correction will handle any additional changes
    if (this.pendingColumns.has(key)) {
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
    }

    // Find an available worker for high-priority block change
    const workerIndex = this.getAvailableWorker()
    if (workerIndex === -1) return // All workers busy, background will catch it

    // Track this as a pending column update
    this.pendingColumns.set(key, column)

    // Transfer buffers to worker
    this.workerBusy[workerIndex] = true
    const transfers = subChunks.flatMap((sc) => [
      sc.blocks.buffer as ArrayBuffer,
      sc.lightData.buffer as ArrayBuffer,
    ])
    this.workers[workerIndex].postMessage(request, transfers)
  }

  /**
   * Serialize sub-chunks from a column for worker transfer.
   */
  private serializeSubChunks(column: ChunkColumn): SubChunkData[] {
    const subChunks: SubChunkData[] = []

    for (let subY = 0; subY < 16; subY++) {
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        subChunks.push({
          subY,
          blocks: new Uint16Array(subChunk.getBlockData()),
          lightData: new Uint8Array(subChunk.getLightData()),
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
    if (!this.config.enabled) return
    if (!this.getColumn || !this.queueSubChunkForMeshing) return

    // Throttle: move 1 pending column to the main queue per frame
    if (this.pendingAddQueue.length > 0) {
      const key = this.pendingAddQueue.shift()!
      this.columnQueue.push(key)
    }

    // Process edge propagation first (spreads light across chunk borders)
    this.processEdgePropagation()

    if (this.columnQueue.length === 0) return

    // Process up to columnsPerUpdate columns
    // Use random selection to avoid ordering dependencies between neighbor chunks
    let processed = 0
    let attempts = 0
    const maxAttempts = this.columnQueue.length * 2 // Prevent infinite loop
    const now = Date.now()

    while (processed < this.config.columnsPerUpdate && attempts < maxAttempts && this.columnQueue.length > 0) {
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

      // Add jitter to long-range cooldowns to stagger reprocessing
      // Use chunk coordinates to create deterministic jitter (0-50% of cooldown)
      let cooldown = baseCooldown
      if (!isNearby) {
        const jitterSeed = (chunkX * 73856093) ^ (chunkZ * 19349663)
        const jitterPercent = (Math.abs(jitterSeed) % 50) / 100 // 0-50%
        cooldown = baseCooldown + baseCooldown * jitterPercent
      }

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
        processed++
      } else {
        // All workers busy - stop trying this frame, will retry next update
        break
      }
    }
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
    }

    // Only mark as pending AFTER we confirmed a worker is available
    this.pendingColumns.set(key, column)
    this.workerBusy[workerIndex] = true
    const transfers = subChunks.flatMap((sc) => [sc.blocks.buffer as ArrayBuffer, sc.lightData.buffer as ArrayBuffer])
    this.workers[workerIndex].postMessage(request, transfers)

    return true
  }

  /**
   * Get index of an available worker, or -1 if all busy.
   */
  private getAvailableWorker(): number {
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      if (!this.workerBusy[i]) {
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

    // Mark as processed
    this.processedColumns.set(key, Date.now())

    // Re-add to queue for future processing
    if (!this.columnQueueSet.has(key)) {
      this.columnQueue.push(key)
      this.columnQueueSet.add(key)
    }

    // Apply updated light data
    for (const updated of result.updatedSubChunks) {
      if (!updated.changed) continue

      const subChunk = column.getSubChunk(updated.subY)
      if (!subChunk) continue

      // Apply the new light data
      const currentLightData = subChunk.getLightData()
      currentLightData.set(updated.lightData)

      // Queue for remeshing
      if (this.queueSubChunkForMeshing) {
        this.queueSubChunkForMeshing(subChunk)
      }

      // Notify listeners
      const coord: ISubChunkCoordinate = {
        x: column.coordinate.x,
        z: column.coordinate.z,
        subY: updated.subY,
      }
      for (const callback of this.onSubChunkLightingUpdated) {
        callback(coord)
      }
    }

    // Queue neighbors for edge propagation to spread light across chunk borders
    this.queueNeighborsForEdgePropagation(column.coordinate)
  }

  /**
   * Queue neighboring columns for edge light propagation.
   */
  private queueNeighborsForEdgePropagation(coord: IChunkCoordinate): void {
    const neighbors = [
      createChunkKey(coord.x + 1n, coord.z),
      createChunkKey(coord.x - 1n, coord.z),
      createChunkKey(coord.x, coord.z + 1n),
      createChunkKey(coord.x, coord.z - 1n),
    ]
    for (const neighborKey of neighbors) {
      this.edgePropagationQueue.add(neighborKey)
    }
    // Also add the source column itself (it may receive light from neighbors)
    this.edgePropagationQueue.add(createChunkKey(coord.x, coord.z))
  }

  /**
   * Process edge propagation - spread light across chunk borders.
   * Runs on main thread (fast, only processes edge blocks).
   */
  private processEdgePropagation(): void {
    if (!this.getColumn || !this.queueSubChunkForMeshing) return
    if (this.edgePropagationQueue.size === 0) return

    // Process up to 5 columns per frame
    const keysToProcess = Array.from(this.edgePropagationQueue).slice(0, 5)

    for (const key of keysToProcess) {
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
        for (let subY = 0; subY < 16; subY++) {
          const targetSub = column.getSubChunk(subY)
          const sourceSub = neighborColumn.getSubChunk(subY)
          if (!targetSub || !sourceSub) continue

          const changed = this.skylightPropagator.propagateFromNeighborSubChunk(
            targetSub,
            sourceSub,
            dir
          )
          if (changed) {
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
   */
  getStats(): {
    queued: number
    processing: number
  } {
    // Count columns that are actually ready to process
    // (within distance, not on cooldown, not already pending)
    const now = Date.now()
    let readyCount = 0

    for (const key of this.columnQueue) {
      // Skip if already pending
      if (this.pendingColumns.has(key)) continue

      // Parse coordinates and check distance
      const [xStr, zStr] = key.split(',')
      const chunkX = Number(xStr)
      const chunkZ = Number(zStr)
      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distance = Math.sqrt(dx * dx + dz * dz)

      // Skip if beyond max distance
      if (distance > this.config.maxDistance) continue

      // Check cooldown (with jitter for long-range)
      const isNearby = distance <= this.config.nearbyDistance
      const baseCooldown = isNearby ? this.config.nearbyReprocessCooldown : this.config.reprocessCooldown
      let cooldown = baseCooldown
      if (!isNearby) {
        const jitterSeed = (chunkX * 73856093) ^ (chunkZ * 19349663)
        const jitterPercent = (Math.abs(jitterSeed) % 50) / 100
        cooldown = baseCooldown + baseCooldown * jitterPercent
      }
      const lastProcessed = this.processedColumns.get(key)
      if (lastProcessed && now - lastProcessed < cooldown) continue

      readyCount++
    }

    return {
      queued: readyCount,
      processing: this.pendingColumns.size,
    }
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
    this.edgePropagationQueue.clear()
    this.onSubChunkLightingUpdated.length = 0
  }
}
