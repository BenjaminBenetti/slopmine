/**
 * Manages liquid physics simulation for water blocks.
 * Queues chunk columns (not individual blocks) to prevent queue explosion.
 * Uses distance-based priority (faster near player) similar to BackgroundLightingManager.
 */

import type { BlockId } from '../interfaces/IBlock.ts'
import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../interfaces/ICoordinates.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'

export interface LiquidPhysicsConfig {
  /** Distance in chunks for "nearby" priority processing (default: 2) */
  nearbyDistance: number
  /** Maximum distance in chunks for background processing (default: 8) */
  maxDistance: number
  /** Whether liquid physics is enabled (default: true) */
  enabled: boolean
  /** Minimum time between updates for a single column in ms (default: 1000 = 1 UPS) */
  updateIntervalMs: number
}

const DEFAULT_CONFIG: LiquidPhysicsConfig = {
  nearbyDistance: 2,
  maxDistance: 8,
  enabled: true,
  updateIntervalMs: 200,
}

/**
 * Water level constants for volume calculations.
 * Full = 4, ThreeQuarter = 3, Half = 2, Quarter = 1, Air = 0
 */
const WATER_LEVELS = {
  FULL: 4,
  THREE_QUARTER: 3,
  HALF: 2,
  QUARTER: 1,
  AIR: 0,
} as const

export class LiquidPhysicsManager {
  private readonly config: LiquidPhysicsConfig

  // Queue of chunk columns to process (deduplicated via Set)
  private readonly columnQueue: ChunkKey[] = []
  private readonly columnQueueSet: Set<ChunkKey> = new Set()

  // Cooldown tracking - when each column was last processed
  private readonly lastProcessedTime: Map<ChunkKey, number> = new Map()

  // Player position for priority calculation (in chunk coordinates)
  private playerChunkX = 0
  private playerChunkZ = 0

  // Stats tracking
  private columnsProcessedSinceLastQuery = 0

  // Callbacks for world access
  private getBlockId: ((x: bigint, y: bigint, z: bigint) => BlockId) | null = null
  private setBlockRaw: ((x: bigint, y: bigint, z: bigint, blockId: BlockId) => boolean) | null = null
  private flushBlockChanges: (() => void) | null = null
  private isColumnLoaded: ((coord: IChunkCoordinate) => boolean) | null = null
  private getLiquidPositions: ((coord: IChunkCoordinate) => Array<{ x: number; worldY: number; z: number }>) | null = null
  private hasBlockTag: ((blockId: BlockId, tag: string) => boolean) | null = null

  constructor(config: Partial<LiquidPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Set the callbacks for world access.
   * Must be called before processing can begin.
   */
  setCallbacks(
    getBlockId: (x: bigint, y: bigint, z: bigint) => BlockId,
    setBlockRaw: (x: bigint, y: bigint, z: bigint, blockId: BlockId) => boolean,
    flushBlockChanges: () => void,
    isColumnLoaded: (coord: IChunkCoordinate) => boolean,
    getLiquidPositions: (coord: IChunkCoordinate) => Array<{ x: number; worldY: number; z: number }>,
    hasBlockTag: (blockId: BlockId, tag: string) => boolean
  ): void {
    this.getBlockId = getBlockId
    this.setBlockRaw = setBlockRaw
    this.flushBlockChanges = flushBlockChanges
    this.isColumnLoaded = isColumnLoaded
    this.getLiquidPositions = getLiquidPositions
    this.hasBlockTag = hasBlockTag
  }

  /**
   * Update the player position for priority processing.
   * Call this each frame with the player's world position.
   */
  setPlayerPosition(worldX: number, worldZ: number): void {
    this.playerChunkX = Math.floor(worldX / CHUNK_SIZE_X)
    this.playerChunkZ = Math.floor(worldZ / CHUNK_SIZE_Z)
  }

  /**
   * Queue a chunk column for liquid physics processing.
   * Call this when a liquid block changes in a column.
   */
  queueColumn(chunkX: bigint, chunkZ: bigint): void {
    if (!this.config.enabled) return

    const key = createChunkKey(chunkX, chunkZ)

    // Don't queue if already in queue (deduplication)
    if (this.columnQueueSet.has(key)) return

    this.columnQueue.push(key)
    this.columnQueueSet.add(key)
  }

  /**
   * Queue a column based on world block coordinates.
   * Convenience method that converts world coords to chunk coords.
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

    // Queue the main column
    this.queueColumn(chunkX, chunkZ)

    // Queue neighbors if the block is near a chunk edge
    const localX = Number(worldX - chunkX * BigInt(CHUNK_SIZE_X))
    const localZ = Number(worldZ - chunkZ * BigInt(CHUNK_SIZE_Z))

    if (localX <= 1) this.queueColumn(chunkX - 1n, chunkZ)
    if (localX >= CHUNK_SIZE_X - 2) this.queueColumn(chunkX + 1n, chunkZ)
    if (localZ <= 1) this.queueColumn(chunkX, chunkZ - 1n)
    if (localZ >= CHUNK_SIZE_Z - 2) this.queueColumn(chunkX, chunkZ + 1n)
  }

  /**
   * Update queue - nothing to do since we use direct queueing.
   * Kept for API compatibility with scheduler.
   */
  updateQueue(): void {
    // No-op - columns are added directly to the queue
  }

  /**
   * Process the next chunk column in the queue.
   * @returns true if more work may remain, false if no work done
   */
  processNextColumn(): boolean {
    if (!this.config.enabled) return false
    if (!this.getBlockId || !this.setBlockRaw || !this.flushBlockChanges || !this.isColumnLoaded || !this.getLiquidPositions || !this.hasBlockTag) return false
    if (this.columnQueue.length === 0) return false

    const now = performance.now()

    // Find the nearest column to process that's not on cooldown
    let bestIndex = -1
    let bestDistance = Infinity

    for (let i = 0; i < this.columnQueue.length; i++) {
      const key = this.columnQueue[i]

      // Check cooldown - skip if processed too recently
      const lastTime = this.lastProcessedTime.get(key) ?? 0
      if (now - lastTime < this.config.updateIntervalMs) {
        continue
      }

      const [xStr, zStr] = key.split(',')
      const chunkX = Number(xStr)
      const chunkZ = Number(zStr)

      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distance = Math.sqrt(dx * dx + dz * dz)

      // Skip columns beyond max distance
      if (distance > this.config.maxDistance) {
        continue
      }

      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }

    // No valid column found (all on cooldown or too far)
    if (bestIndex === -1) {
      return this.columnQueue.length > 0
    }

    // Remove from queue
    const key = this.columnQueue[bestIndex]
    this.columnQueue.splice(bestIndex, 1)
    this.columnQueueSet.delete(key)

    // Record processing time for cooldown
    this.lastProcessedTime.set(key, now)

    // Parse coordinates
    const [xStr, zStr] = key.split(',')
    const chunkX = BigInt(xStr)
    const chunkZ = BigInt(zStr)
    const coord: IChunkCoordinate = { x: chunkX, z: chunkZ }

    // Check if column is loaded
    if (!this.isColumnLoaded(coord)) {
      return this.columnQueue.length > 0
    }

    // Process all water blocks in this column
    const changed = this.processColumn(chunkX, chunkZ)
    this.columnsProcessedSinceLastQuery++

    // Flush all block changes at once (triggers lighting/meshing once, not per-block)
    this.flushBlockChanges!()

    // If water changed, re-queue this column and neighbors for continued processing
    if (changed) {
      this.queueColumn(chunkX, chunkZ)
      this.queueColumn(chunkX - 1n, chunkZ)
      this.queueColumn(chunkX + 1n, chunkZ)
      this.queueColumn(chunkX, chunkZ - 1n)
      this.queueColumn(chunkX, chunkZ + 1n)
    }

    return this.columnQueue.length > 0
  }

  /**
   * Process all water blocks in a chunk column.
   * Uses the column's liquid block lookup for O(n) where n = liquid blocks, not total blocks.
   * @returns true if any water block changed
   */
  private processColumn(chunkX: bigint, chunkZ: bigint): boolean {
    const coord: IChunkCoordinate = { x: chunkX, z: chunkZ }
    const liquidPositions = this.getLiquidPositions!(coord)

    if (liquidPositions.length === 0) {
      return false
    }

    const baseX = chunkX * BigInt(CHUNK_SIZE_X)
    const baseZ = chunkZ * BigInt(CHUNK_SIZE_Z)

    // Sort by Y descending (top to bottom) for proper gravity flow
    liquidPositions.sort((a, b) => b.worldY - a.worldY)

    let anyChanged = false

    for (const pos of liquidPositions) {
      const worldX = baseX + BigInt(pos.x)
      const worldY = BigInt(pos.worldY)
      const worldZ = baseZ + BigInt(pos.z)

      // Verify block is still liquid (may have changed during processing)
      const blockId = this.getBlockId!(worldX, worldY, worldZ)
      if (this.isLiquidBlock(blockId)) {
        const changed = this.processFlow(worldX, worldY, worldZ)
        if (changed) anyChanged = true
      }
    }

    return anyChanged
  }

  /**
   * Get the water level (0-4) for a block ID.
   */
  private getWaterLevel(blockId: BlockId): number {
    switch (blockId) {
      case BlockIds.WATER:
        return WATER_LEVELS.FULL
      case BlockIds.WATER_THREE_QUARTER:
        return WATER_LEVELS.THREE_QUARTER
      case BlockIds.WATER_HALF:
        return WATER_LEVELS.HALF
      case BlockIds.WATER_QUARTER:
        return WATER_LEVELS.QUARTER
      default:
        return WATER_LEVELS.AIR
    }
  }

  /**
   * Convert a water level (0-4) to a block ID.
   */
  private levelToBlockId(level: number): BlockId {
    if (level >= WATER_LEVELS.FULL) return BlockIds.WATER
    if (level >= WATER_LEVELS.THREE_QUARTER) return BlockIds.WATER_THREE_QUARTER
    if (level >= WATER_LEVELS.HALF) return BlockIds.WATER_HALF
    if (level >= WATER_LEVELS.QUARTER) return BlockIds.WATER_QUARTER
    return BlockIds.AIR
  }

  /**
   * Check if a block ID is a liquid block.
   */
  private isLiquidBlock(blockId: BlockId): boolean {
    return (
      blockId === BlockIds.WATER ||
      blockId === BlockIds.WATER_THREE_QUARTER ||
      blockId === BlockIds.WATER_HALF ||
      blockId === BlockIds.WATER_QUARTER
    )
  }

  /**
   * Check if water can flow into a block (air or partial water).
   */
  private canFlowInto(blockId: BlockId): boolean {
    if (blockId === BlockIds.AIR) return true
    if (this.isLiquidBlock(blockId) && this.getWaterLevel(blockId) < WATER_LEVELS.FULL) return true
    return false
  }

  /**
   * Process liquid flow for a single block using even distribution algorithm.
   * Flow priority: Down first, then horizontal spread to ALL valid neighbors.
   * @returns true if any flow occurred
   */
  private processFlow(x: bigint, y: bigint, z: bigint): boolean {
    const blockId = this.getBlockId!(x, y, z)
    const level = this.getWaterLevel(blockId)

    // Not a liquid block, nothing to do
    if (level === 0) return false

    // === STEP 1: FLOW DOWN (highest priority) ===
    const belowId = this.getBlockId!(x, y - 1n, z)
    const belowLevel = this.getWaterLevel(belowId)

    // Fall into empty space - entire block moves down
    if (belowId === BlockIds.AIR) {
      this.setBlockRaw!(x, y - 1n, z, this.levelToBlockId(level))
      this.setBlockRaw!(x, y, z, BlockIds.AIR)
      return true
    }

    // Combine with partial water below
    if (belowLevel > 0 && belowLevel < WATER_LEVELS.FULL) {
      const total = level + belowLevel
      if (total <= WATER_LEVELS.FULL) {
        this.setBlockRaw!(x, y - 1n, z, this.levelToBlockId(total))
        this.setBlockRaw!(x, y, z, BlockIds.AIR)
      } else {
        this.setBlockRaw!(x, y - 1n, z, BlockIds.WATER)
        this.setBlockRaw!(x, y, z, this.levelToBlockId(total - WATER_LEVELS.FULL))
      }
      return true
    }

    // === STEP 2: HORIZONTAL SPREAD (even distribution) ===
    // Gather all neighbors
    const neighbors = [
      { x: x + 1n, z },
      { x: x - 1n, z },
      { x, z: z + 1n },
      { x, z: z - 1n },
    ].map((n) => {
      const id = this.getBlockId!(n.x, y, n.z)
      return {
        x: n.x,
        z: n.z,
        level: this.getWaterLevel(id),
        canFlow: this.canFlowInto(id),
      }
    })

    // Find targets: air or water with lower level than self
    const flowTargets = neighbors.filter((n) => n.canFlow && n.level < level)
    if (flowTargets.length === 0) return false

    // Calculate total water and even distribution
    const totalWater = level + flowTargets.reduce((sum, n) => sum + n.level, 0)
    const cellCount = flowTargets.length + 1 // targets + self

    // Calculate even split
    const baseLevel = Math.floor(totalWater / cellCount)
    let remainder = totalWater % cellCount

    // Assign levels (remainder goes to cells that had more water, i.e., self first)
    const selfLevel = baseLevel + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder--

    // Only proceed if something actually changes
    if (selfLevel === level) return false

    this.setBlockRaw!(x, y, z, this.levelToBlockId(selfLevel))

    for (const target of flowTargets) {
      const newLevel = baseLevel + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder--
      this.setBlockRaw!(target.x, y, target.z, this.levelToBlockId(newLevel))
    }

    return true
  }

  /**
   * Get statistics about the current queue state.
   * Resets the processed counter after reading.
   */
  getStats(): { columnsProcessed: number; columnsQueued: number } {
    const processed = this.columnsProcessedSinceLastQuery
    this.columnsProcessedSinceLastQuery = 0
    return {
      columnsProcessed: processed,
      columnsQueued: this.columnQueue.length,
    }
  }
}
