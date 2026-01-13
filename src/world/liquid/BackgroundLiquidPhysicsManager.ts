/**
 * Manages liquid physics simulation using a pool of background workers.
 * Follows the same pattern as BackgroundLightingManager.
 */

import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../interfaces/ICoordinates.ts'
import type { ChunkColumn } from '../chunks/ChunkColumn.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import type {
  LiquidPhysicsRequest,
  LiquidPhysicsResponse,
  LiquidPhysicsError,
  LiquidSubChunkData,
} from '../../workers/LiquidPhysicsWorker.ts'

export interface BackgroundLiquidPhysicsConfig {
  /** Distance in chunks for "nearby" priority processing (default: 2) */
  nearbyDistance: number
  /** Maximum distance in chunks for background processing (default: 8) */
  maxDistance: number
  /** Whether liquid physics is enabled (default: true) */
  enabled: boolean
  /** Minimum time between updates for nearby columns in ms (default: 500) */
  updateIntervalMs: number
  /** Minimum time between background updates for far columns in ms (default: 5000) */
  backgroundUpdateIntervalMs: number
  /** Interval between background queue scans in ms (default: 30000) */
  backgroundScanIntervalMs: number
}

const DEFAULT_CONFIG: BackgroundLiquidPhysicsConfig = {
  nearbyDistance: 2,
  maxDistance: 8,
  enabled: true,
  updateIntervalMs: 500,
  backgroundUpdateIntervalMs: 5000,
  backgroundScanIntervalMs: 30000,
}

export class BackgroundLiquidPhysicsManager {
  private readonly config: BackgroundLiquidPhysicsConfig
  private readonly workers: Worker[] = []
  private readonly workerBusy: boolean[] = []
  private readonly WORKER_COUNT = 4

  // Column tracking
  private readonly pendingColumns: Map<ChunkKey, ChunkColumn> = new Map()
  private readonly columnQueue: ChunkKey[] = []
  private readonly columnQueueSet: Set<ChunkKey> = new Set()
  private readonly lastProcessedTime: Map<ChunkKey, number> = new Map()

  // Stats tracking
  private columnsProcessedSinceLastQuery = 0

  // Player position for distance-based processing (in chunk coordinates)
  private playerChunkX = 0
  private playerChunkZ = 0

  // Background queue scanning
  private lastBackgroundScanTime = 0

  // Callbacks for world access
  private getColumn: ((coord: IChunkCoordinate) => ChunkColumn | undefined) | null = null
  private setBlockRaw: ((x: bigint, y: bigint, z: bigint, blockId: number) => boolean) | null = null
  private flushBlockChanges: (() => void) | null = null

  constructor(config: Partial<BackgroundLiquidPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initWorkers()
  }

  /**
   * Initialize worker pool.
   */
  private initWorkers(): void {
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('../../workers/LiquidPhysicsWorker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (event: MessageEvent<LiquidPhysicsResponse | LiquidPhysicsError>) => {
        this.workerBusy[i] = false
        this.handleWorkerResult(event.data)
      }

      worker.onerror = (error) => {
        console.error('Liquid physics worker error:', error)
        this.workerBusy[i] = false
        // Clear pending columns to prevent stuck state
        this.pendingColumns.clear()
      }

      this.workers.push(worker)
      this.workerBusy.push(false)
    }
  }

  /**
   * Set the callbacks for world access.
   * Must be called before processing can begin.
   */
  setCallbacks(
    getColumn: (coord: IChunkCoordinate) => ChunkColumn | undefined,
    setBlockRaw: (x: bigint, y: bigint, z: bigint, blockId: number) => boolean,
    flushBlockChanges: () => void
  ): void {
    this.getColumn = getColumn
    this.setBlockRaw = setBlockRaw
    this.flushBlockChanges = flushBlockChanges
  }

  /**
   * Update the player position for distance-based processing.
   */
  setPlayerPosition(worldX: number, worldZ: number): void {
    this.playerChunkX = Math.floor(worldX / CHUNK_SIZE_X)
    this.playerChunkZ = Math.floor(worldZ / CHUNK_SIZE_Z)
  }

  /**
   * Queue a chunk column for liquid physics processing.
   */
  queueColumn(chunkX: bigint, chunkZ: bigint): void {
    if (!this.config.enabled) return

    const key = createChunkKey(chunkX, chunkZ)
    if (this.columnQueueSet.has(key)) return

    this.columnQueue.push(key)
    this.columnQueueSet.add(key)
  }

  /**
   * Queue a column based on world block coordinates.
   */
  queueColumnAt(worldX: bigint, worldZ: bigint): void {
    const chunkX = worldX < 0n ? (worldX + 1n) / BigInt(CHUNK_SIZE_X) - 1n : worldX / BigInt(CHUNK_SIZE_X)
    const chunkZ = worldZ < 0n ? (worldZ + 1n) / BigInt(CHUNK_SIZE_Z) - 1n : worldZ / BigInt(CHUNK_SIZE_Z)
    this.queueColumn(chunkX, chunkZ)
  }

  /**
   * Queue a column and its neighbors (for edge effects).
   */
  queueColumnAndNeighbors(worldX: bigint, worldZ: bigint): void {
    const chunkX = worldX < 0n ? (worldX + 1n) / BigInt(CHUNK_SIZE_X) - 1n : worldX / BigInt(CHUNK_SIZE_X)
    const chunkZ = worldZ < 0n ? (worldZ + 1n) / BigInt(CHUNK_SIZE_Z) - 1n : worldZ / BigInt(CHUNK_SIZE_Z)

    this.queueColumn(chunkX, chunkZ)

    const localX = Number(worldX - chunkX * BigInt(CHUNK_SIZE_X))
    const localZ = Number(worldZ - chunkZ * BigInt(CHUNK_SIZE_Z))

    if (localX <= 1) this.queueColumn(chunkX - 1n, chunkZ)
    if (localX >= CHUNK_SIZE_X - 2) this.queueColumn(chunkX + 1n, chunkZ)
    if (localZ <= 1) this.queueColumn(chunkX, chunkZ - 1n)
    if (localZ >= CHUNK_SIZE_Z - 2) this.queueColumn(chunkX, chunkZ + 1n)
  }

  /**
   * Periodically queue nearby columns for background liquid physics processing.
   */
  updateQueue(): void {
    if (!this.config.enabled) return

    const now = performance.now()

    // Only scan periodically
    if (now - this.lastBackgroundScanTime < this.config.backgroundScanIntervalMs) {
      return
    }
    this.lastBackgroundScanTime = now

    // Queue chunks in a small area around the player
    const radius = this.config.nearbyDistance
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const chunkX = BigInt(this.playerChunkX + dx)
        const chunkZ = BigInt(this.playerChunkZ + dz)
        this.queueColumn(chunkX, chunkZ)
      }
    }
  }

  /**
   * Process the next chunk column in the queue.
   * @returns true if work was done or more work remains
   */
  processNextColumn(): boolean {
    if (!this.config.enabled) return false
    if (!this.getColumn || !this.setBlockRaw || !this.flushBlockChanges) return false
    if (this.columnQueue.length === 0) return false

    const now = performance.now()

    // Find first column that's ready to process
    let keyToProcess: ChunkKey | null = null
    let keysSkipped = 0

    for (let i = 0; i < this.columnQueue.length; i++) {
      const key = this.columnQueue[i]

      // Skip if already being processed by a worker
      if (this.pendingColumns.has(key)) {
        continue
      }

      const [xStr, zStr] = key.split(',')
      const chunkX = Number(xStr)
      const chunkZ = Number(zStr)

      // Calculate distance from player
      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distance = Math.sqrt(dx * dx + dz * dz)

      // Remove if beyond max distance (don't let them pile up)
      if (distance > this.config.maxDistance) {
        this.columnQueue.splice(i, 1)
        this.columnQueueSet.delete(key)
        i-- // Adjust index after removal
        continue
      }

      // Use shorter cooldown for nearby chunks
      const isNearby = distance <= this.config.nearbyDistance
      const baseCooldown = isNearby
        ? this.config.updateIntervalMs
        : this.config.backgroundUpdateIntervalMs

      // Add deterministic jitter
      const jitterSeed = (chunkX * 73856093) ^ (chunkZ * 19349663)
      const jitterPercent = isNearby
        ? (Math.abs(jitterSeed) % 100) / 100
        : (Math.abs(jitterSeed) % 50) / 100
      const effectiveCooldown = baseCooldown + baseCooldown * jitterPercent

      const lastTime = this.lastProcessedTime.get(key) ?? 0
      if (now - lastTime >= effectiveCooldown) {
        keyToProcess = key
        break
      }

      keysSkipped++
      if (keysSkipped >= 10) break
    }

    if (!keyToProcess) {
      return this.columnQueue.length > 0
    }

    // Try to send to worker
    const [xStr, zStr] = keyToProcess.split(',')
    const chunkX = BigInt(xStr)
    const chunkZ = BigInt(zStr)
    const coord: IChunkCoordinate = { x: chunkX, z: chunkZ }

    const column = this.getColumn(coord)
    if (!column) {
      // Column unloaded, remove from queue
      const idx = this.columnQueue.indexOf(keyToProcess)
      if (idx !== -1) {
        this.columnQueue.splice(idx, 1)
      }
      this.columnQueueSet.delete(keyToProcess)
      return this.columnQueue.length > 0
    }

    // Send to worker
    if (this.sendColumnToWorker(column, keyToProcess)) {
      // Remove from queue
      const idx = this.columnQueue.indexOf(keyToProcess)
      if (idx !== -1) {
        this.columnQueue.splice(idx, 1)
      }
      this.columnQueueSet.delete(keyToProcess)
      this.lastProcessedTime.set(keyToProcess, now)
      return true
    }

    // All workers busy
    return this.columnQueue.length > 0
  }

  /**
   * Find an available worker.
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
   * Send a column to a worker for processing.
   */
  private sendColumnToWorker(column: ChunkColumn, key: ChunkKey): boolean {
    const workerIndex = this.getAvailableWorker()
    if (workerIndex === -1) return false

    const coord = column.coordinate
    const liquidPositions = column.getLiquidBlockPositions()

    // Skip if no liquids
    if (liquidPositions.length === 0) {
      return true // "Success" - nothing to process
    }

    // Determine which sub-chunks we need
    const subYsNeeded = new Set<number>()
    for (const pos of liquidPositions) {
      const subY = Math.floor(pos.worldY / SUB_CHUNK_HEIGHT)
      subYsNeeded.add(subY)
      // Add adjacent for vertical flow
      if (subY > 0) subYsNeeded.add(subY - 1)
      if (subY < SUB_CHUNK_COUNT - 1) subYsNeeded.add(subY + 1)
    }

    // Serialize sub-chunks
    const subChunks: LiquidSubChunkData[] = []
    for (const subY of subYsNeeded) {
      const subChunk = column.getSubChunk(subY)
      if (subChunk) {
        subChunks.push({
          subY,
          blocks: new Uint16Array(subChunk.getBlockData()),
        })
      }
    }

    if (subChunks.length === 0) {
      return true // No sub-chunks loaded
    }

    // Extract neighbor boundary data
    const neighborPosX = this.extractNeighborBoundary(coord.x + 1n, coord.z, 'negX', subYsNeeded)
    const neighborNegX = this.extractNeighborBoundary(coord.x - 1n, coord.z, 'posX', subYsNeeded)
    const neighborPosZ = this.extractNeighborBoundary(coord.x, coord.z + 1n, 'negZ', subYsNeeded)
    const neighborNegZ = this.extractNeighborBoundary(coord.x, coord.z - 1n, 'posZ', subYsNeeded)

    const request: LiquidPhysicsRequest = {
      type: 'process-liquid',
      chunkX: Number(coord.x),
      chunkZ: Number(coord.z),
      liquidPositions,
      subChunks,
      neighborPosX,
      neighborNegX,
      neighborPosZ,
      neighborNegZ,
    }

    // Track as pending
    this.pendingColumns.set(key, column)
    this.workerBusy[workerIndex] = true

    // Collect buffers for transfer
    const transfers: ArrayBuffer[] = []
    for (const sc of subChunks) {
      transfers.push(sc.blocks.buffer as ArrayBuffer)
    }
    if (neighborPosX) {
      for (const n of neighborPosX) transfers.push(n.data.buffer as ArrayBuffer)
    }
    if (neighborNegX) {
      for (const n of neighborNegX) transfers.push(n.data.buffer as ArrayBuffer)
    }
    if (neighborPosZ) {
      for (const n of neighborPosZ) transfers.push(n.data.buffer as ArrayBuffer)
    }
    if (neighborNegZ) {
      for (const n of neighborNegZ) transfers.push(n.data.buffer as ArrayBuffer)
    }

    this.workers[workerIndex].postMessage(request, transfers)
    return true
  }

  /**
   * Extract 1-block-deep boundary layer from a neighbor column.
   */
  private extractNeighborBoundary(
    chunkX: bigint,
    chunkZ: bigint,
    edge: 'posX' | 'negX' | 'posZ' | 'negZ',
    subYsNeeded: Set<number>
  ): Array<{ subY: number; data: Uint16Array }> | null {
    if (!this.getColumn) return null

    const neighborColumn = this.getColumn({ x: chunkX, z: chunkZ })
    if (!neighborColumn) return null

    const result: Array<{ subY: number; data: Uint16Array }> = []

    for (const subY of subYsNeeded) {
      const subChunk = neighborColumn.getSubChunk(subY)
      if (!subChunk) continue

      const blocks = subChunk.getBlockData()
      let layer: Uint16Array

      if (edge === 'posX' || edge === 'negX') {
        // X edge: extract column along X axis (SIZE_Z * SUB_CHUNK_HEIGHT elements)
        layer = new Uint16Array(CHUNK_SIZE_Z * SUB_CHUNK_HEIGHT)
        const xPos = edge === 'posX' ? CHUNK_SIZE_X - 1 : 0

        for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            const srcIndex = localY * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + xPos
            const dstIndex = localY * CHUNK_SIZE_Z + z
            layer[dstIndex] = blocks[srcIndex]
          }
        }
      } else {
        // Z edge: extract column along Z axis (SIZE_X * SUB_CHUNK_HEIGHT elements)
        layer = new Uint16Array(CHUNK_SIZE_X * SUB_CHUNK_HEIGHT)
        const zPos = edge === 'posZ' ? CHUNK_SIZE_Z - 1 : 0

        for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
          for (let x = 0; x < CHUNK_SIZE_X; x++) {
            const srcIndex = localY * CHUNK_SIZE_X * CHUNK_SIZE_Z + zPos * CHUNK_SIZE_X + x
            const dstIndex = localY * CHUNK_SIZE_X + x
            layer[dstIndex] = blocks[srcIndex]
          }
        }
      }

      result.push({ subY, data: layer })
    }

    return result.length > 0 ? result : null
  }

  /**
   * Handle worker result.
   */
  private handleWorkerResult(result: LiquidPhysicsResponse | LiquidPhysicsError): void {
    const key = createChunkKey(BigInt(result.chunkX), BigInt(result.chunkZ))
    const column = this.pendingColumns.get(key)
    this.pendingColumns.delete(key)

    if (result.type === 'liquid-error') {
      console.warn(`Liquid physics error for chunk ${result.chunkX},${result.chunkZ}: ${result.error}`)
      return
    }

    if (!column) {
      // Column was unloaded while processing
      return
    }

    this.columnsProcessedSinceLastQuery++

    // Apply all block changes
    if (result.changes.length > 0 && this.setBlockRaw) {
      for (const change of result.changes) {
        this.setBlockRaw(BigInt(change.x), BigInt(change.y), BigInt(change.z), change.blockId)
      }

      // Flush changes to trigger lighting/meshing
      this.flushBlockChanges?.()
    }

    // Queue neighbor columns that were affected
    for (const neighbor of result.columnsToRequeue) {
      this.queueColumn(BigInt(neighbor.chunkX), BigInt(neighbor.chunkZ))
    }

    // Re-queue self if changes occurred
    if (result.anyChanged) {
      this.queueColumn(BigInt(result.chunkX), BigInt(result.chunkZ))
    }

    // Clean up old cooldown entries periodically
    if (this.lastProcessedTime.size > 1000) {
      const now = performance.now()
      const cutoff = now - this.config.updateIntervalMs * 2
      for (const [k, t] of this.lastProcessedTime) {
        if (t < cutoff) this.lastProcessedTime.delete(k)
      }
    }
  }

  /**
   * Get statistics about the current queue state.
   */
  getStats(): { columnsProcessed: number; columnsQueued: number } {
    const processed = this.columnsProcessedSinceLastQuery
    this.columnsProcessedSinceLastQuery = 0
    return {
      columnsProcessed: processed,
      columnsQueued: this.columnQueue.length,
    }
  }

  /**
   * Get the set of chunk column keys currently in the queue.
   * Used for debug visualization.
   */
  getQueuedColumnKeys(): ReadonlySet<ChunkKey> {
    return this.columnQueueSet
  }

  /**
   * Enable or disable liquid physics.
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
    this.workers.length = 0
    this.workerBusy.length = 0
    this.pendingColumns.clear()
    this.columnQueue.length = 0
    this.columnQueueSet.clear()
    this.lastProcessedTime.clear()
  }
}
