/**
 * Manages background lighting correction for the world.
 * Periodically re-calculates skylight for chunk columns to fix
 * lighting errors that occur during generation.
 */

import type { IChunkCoordinate, ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../interfaces/ICoordinates.ts'
import type { ChunkColumn } from '../chunks/ChunkColumn.ts'
import type { SubChunk } from '../chunks/SubChunk.ts'
import type { LightingRequest, LightingResponse, LightingError } from '../../workers/LightingWorker.ts'

export interface BackgroundLightingConfig {
  /** How many columns to process per update cycle (default: 1) */
  columnsPerUpdate: number
  /** Minimum time between processing the same column again in ms (default: 60000 = 1 minute) */
  reprocessCooldown: number
  /** Minimum time between processing nearby columns in ms (default: 10000 = 10 seconds) */
  nearbyReprocessCooldown: number
  /** Distance in chunks for "nearby" priority processing (default: 4) */
  nearbyDistance: number
  /** Whether background lighting is enabled (default: true) */
  enabled: boolean
}

const DEFAULT_CONFIG: BackgroundLightingConfig = {
  columnsPerUpdate: 1,
  reprocessCooldown: 60000, // 1 minute
  nearbyReprocessCooldown: 10000, // 10 seconds
  nearbyDistance: 4,
  enabled: true,
}

export class BackgroundLightingManager {
  private readonly config: BackgroundLightingConfig
  private readonly worker: Worker
  private readonly pendingColumns: Map<ChunkKey, ChunkColumn> = new Map()
  private readonly processedColumns: Map<ChunkKey, number> = new Map() // chunkKey -> timestamp
  private readonly columnQueue: ChunkKey[] = []

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

    // Create the lighting worker
    this.worker = new Worker(
      new URL('../../workers/LightingWorker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.onmessage = (event: MessageEvent<LightingResponse | LightingError>) => {
      this.handleWorkerResult(event.data)
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
   */
  queueColumn(coordinate: IChunkCoordinate): void {
    if (!this.config.enabled) return

    const key = createChunkKey(coordinate.x, coordinate.z)

    // Don't queue if already in queue
    if (this.columnQueue.includes(key)) return

    this.columnQueue.push(key)
  }

  /**
   * Remove a chunk column from tracking when it's unloaded.
   */
  unloadColumn(coordinate: IChunkCoordinate): void {
    const key = createChunkKey(coordinate.x, coordinate.z)

    // Remove from queue
    const queueIndex = this.columnQueue.indexOf(key)
    if (queueIndex !== -1) {
      this.columnQueue.splice(queueIndex, 1)
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
   * Check if a chunk is within the nearby priority distance of the player.
   */
  private isNearPlayer(chunkX: number, chunkZ: number): boolean {
    const dx = chunkX - this.playerChunkX
    const dz = chunkZ - this.playerChunkZ
    const distance = Math.sqrt(dx * dx + dz * dz)
    return distance <= this.config.nearbyDistance
  }

  /**
   * Update the background lighting system.
   * Call this each frame to process queued columns.
   */
  update(): void {
    if (!this.config.enabled) return
    if (!this.getColumn || !this.queueSubChunkForMeshing) return
    if (this.columnQueue.length === 0) return

    // Process up to columnsPerUpdate columns
    let processed = 0
    let checked = 0
    const queueLength = this.columnQueue.length
    const now = Date.now()

    while (processed < this.config.columnsPerUpdate && checked < queueLength) {
      const key = this.columnQueue[0]
      checked++

      // Parse chunk coordinates to check distance
      const [xStr, zStr] = key.split(',')
      const chunkX = Number(xStr)
      const chunkZ = Number(zStr)

      // Use shorter cooldown for nearby chunks
      const isNearby = this.isNearPlayer(chunkX, chunkZ)
      const cooldown = isNearby ? this.config.nearbyReprocessCooldown : this.config.reprocessCooldown

      // Check if this column was recently processed
      const lastProcessed = this.processedColumns.get(key)
      if (lastProcessed && now - lastProcessed < cooldown) {
        // Move to end of queue and try next
        this.columnQueue.shift()
        this.columnQueue.push(key)
        continue
      }

      // Check if already pending
      if (this.pendingColumns.has(key)) {
        this.columnQueue.shift()
        continue
      }

      // Get the column
      const coord: IChunkCoordinate = { x: BigInt(xStr), z: BigInt(zStr) }
      const column = this.getColumn(coord)

      if (!column) {
        // Column no longer exists, remove from queue
        this.columnQueue.shift()
        this.processedColumns.delete(key)
        continue
      }

      // Send to worker
      this.sendColumnToWorker(column, key)
      this.columnQueue.shift()
      processed++
    }
  }

  /**
   * Send a column to the worker for lighting recalculation.
   */
  private sendColumnToWorker(column: ChunkColumn, key: ChunkKey): void {
    const coord = column.coordinate
    const subChunks: LightingRequest['subChunks'] = []

    // Collect all generated sub-chunks
    for (let subY = 0; subY < 16; subY++) {
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        // Copy block and light data (will be transferred to worker)
        const blocks = new Uint16Array(subChunk.getBlockData())
        const lightData = new Uint8Array(subChunk.getLightData())

        subChunks.push({
          subY,
          blocks,
          lightData,
        })
      }
    }

    if (subChunks.length === 0) {
      // No sub-chunks to process
      return
    }

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

    this.pendingColumns.set(key, column)

    // Transfer the buffers to the worker
    const transfers = subChunks.flatMap((sc) => [sc.blocks.buffer as ArrayBuffer, sc.lightData.buffer as ArrayBuffer])
    this.worker.postMessage(request, transfers)
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
    if (!this.columnQueue.includes(key)) {
      this.columnQueue.push(key)
    }

    // Apply updated light data
    let anyChanged = false
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

      anyChanged = true
    }
  }

  /**
   * Get statistics about the background lighting system.
   */
  getStats(): {
    waitingCount: number
    pendingCount: number
    processedCount: number
    enabled: boolean
  } {
    // Count columns in queue that haven't been processed yet
    let waitingCount = 0
    for (const key of this.columnQueue) {
      if (!this.processedColumns.has(key) && !this.pendingColumns.has(key)) {
        waitingCount++
      }
    }

    return {
      waitingCount,
      pendingCount: this.pendingColumns.size,
      processedCount: this.processedColumns.size,
      enabled: this.config.enabled,
    }
  }

  /**
   * Enable or disable background lighting.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  /**
   * Dispose of the manager and terminate the worker.
   */
  dispose(): void {
    this.worker.terminate()
    this.pendingColumns.clear()
    this.processedColumns.clear()
    this.columnQueue.length = 0
    this.onSubChunkLightingUpdated.length = 0
  }
}
