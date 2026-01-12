/**
 * Manages liquid physics simulation for water blocks.
 * Uses simple Minecraft-style flow: water slopes down from source blocks.
 * No volume conservation - water just flows and dissipates.
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
  /** Minimum time between updates for a single column in ms (default: 100) */
  updateIntervalMs: number
}

const DEFAULT_CONFIG: LiquidPhysicsConfig = {
  nearbyDistance: 2,
  maxDistance: 8,
  enabled: true,
  updateIntervalMs: 500,  // Slower updates = less CPU
}

/**
 * Water levels - full source is 8, flowing water decreases to 1.
 * Level 0 = air.
 */
const WATER_LEVEL_MAX = 8
const WATER_LEVEL_MIN = 1

export class LiquidPhysicsManager {
  private readonly config: LiquidPhysicsConfig

  // Queue of chunk columns to process (deduplicated via Set)
  private readonly columnQueue: ChunkKey[] = []
  private readonly columnQueueSet: Set<ChunkKey> = new Set()

  // Per-column cooldown tracking (key -> last processed timestamp)
  private readonly lastProcessedTime: Map<ChunkKey, number> = new Map()

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
   * Update the player position (no longer used, kept for API compatibility).
   */
  setPlayerPosition(_worldX: number, _worldZ: number): void {
    // No longer used - simple FIFO queue now
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
   * No-op for API compatibility.
   */
  updateQueue(): void {}

  /**
   * Process the next chunk column in the queue (FIFO with cooldown).
   */
  processNextColumn(): boolean {
    if (!this.config.enabled) return false
    if (!this.getBlockId || !this.setBlockRaw || !this.flushBlockChanges || !this.isColumnLoaded || !this.getLiquidPositions) return false
    if (this.columnQueue.length === 0) return false

    const now = performance.now()

    // Find first column that's not on cooldown
    let keyToProcess: ChunkKey | null = null
    let keysSkipped = 0

    for (let i = 0; i < this.columnQueue.length; i++) {
      const key = this.columnQueue[i]
      const lastTime = this.lastProcessedTime.get(key) ?? 0
      if (now - lastTime >= this.config.updateIntervalMs) {
        // This column is ready - remove it from queue
        this.columnQueue.splice(i, 1)
        this.columnQueueSet.delete(key)
        keyToProcess = key
        break
      }
      keysSkipped++
      // Don't search forever - if first 10 are all on cooldown, wait
      if (keysSkipped >= 10) break
    }

    if (!keyToProcess) {
      // All checked columns are on cooldown
      return this.columnQueue.length > 0
    }

    const [xStr, zStr] = keyToProcess.split(',')
    const chunkX = BigInt(xStr)
    const chunkZ = BigInt(zStr)
    const coord: IChunkCoordinate = { x: chunkX, z: chunkZ }

    if (!this.isColumnLoaded(coord)) {
      return this.columnQueue.length > 0
    }

    // Mark as processed
    this.lastProcessedTime.set(keyToProcess, now)

    const changed = this.processColumn(chunkX, chunkZ)
    this.columnsProcessedSinceLastQuery++

    this.flushBlockChanges!()

    // Only re-queue self if water changed
    if (changed) {
      this.queueColumn(chunkX, chunkZ)
    }

    // Clean up old cooldown entries periodically (when map gets large)
    if (this.lastProcessedTime.size > 1000) {
      const cutoff = now - this.config.updateIntervalMs * 2
      for (const [k, t] of this.lastProcessedTime) {
        if (t < cutoff) this.lastProcessedTime.delete(k)
      }
    }

    return this.columnQueue.length > 0
  }

  /**
   * Process all water blocks in a chunk column.
   */
  private processColumn(chunkX: bigint, chunkZ: bigint): boolean {
    const coord: IChunkCoordinate = { x: chunkX, z: chunkZ }
    const liquidPositions = this.getLiquidPositions!(coord)

    if (liquidPositions.length === 0) return false

    const baseX = chunkX * BigInt(CHUNK_SIZE_X)
    const baseZ = chunkZ * BigInt(CHUNK_SIZE_Z)

    // Sort by Y descending (top to bottom) for proper flow
    liquidPositions.sort((a, b) => b.worldY - a.worldY)

    let anyChanged = false

    for (const pos of liquidPositions) {
      const worldX = baseX + BigInt(pos.x)
      const worldY = BigInt(pos.worldY)
      const worldZ = baseZ + BigInt(pos.z)

      const blockId = this.getBlockId!(worldX, worldY, worldZ)
      if (this.isWaterBlock(blockId)) {
        if (this.processWaterBlock(worldX, worldY, worldZ)) {
          anyChanged = true
        }
      }
    }

    return anyChanged
  }

  /**
   * Get the water level (1-8) for a block ID. 0 = not water.
   */
  private getWaterLevel(blockId: BlockId): number {
    switch (blockId) {
      case BlockIds.WATER: return 8
      case BlockIds.WATER_SEVEN_EIGHTH: return 7
      case BlockIds.WATER_THREE_QUARTER: return 6
      case BlockIds.WATER_FIVE_EIGHTH: return 5
      case BlockIds.WATER_HALF: return 4
      case BlockIds.WATER_THREE_EIGHTH: return 3
      case BlockIds.WATER_QUARTER: return 2
      case BlockIds.WATER_EIGHTH: return 1
      default: return 0
    }
  }

  /**
   * Convert a water level (1-8) to a block ID.
   */
  private levelToBlockId(level: number): BlockId {
    if (level >= 8) return BlockIds.WATER
    if (level >= 7) return BlockIds.WATER_SEVEN_EIGHTH
    if (level >= 6) return BlockIds.WATER_THREE_QUARTER
    if (level >= 5) return BlockIds.WATER_FIVE_EIGHTH
    if (level >= 4) return BlockIds.WATER_HALF
    if (level >= 3) return BlockIds.WATER_THREE_EIGHTH
    if (level >= 2) return BlockIds.WATER_QUARTER
    if (level >= 1) return BlockIds.WATER_EIGHTH
    return BlockIds.AIR
  }

  /**
   * Check if a block is any type of water.
   */
  private isWaterBlock(blockId: BlockId): boolean {
    return this.getWaterLevel(blockId) > 0
  }

  /**
   * Check if water can flow into a block (air or lower water).
   */
  private canFlowInto(blockId: BlockId): boolean {
    return blockId === BlockIds.AIR || this.isWaterBlock(blockId)
  }

  /**
   * Check if a block is solid (can't flow into).
   */
  private isSolid(blockId: BlockId): boolean {
    return blockId !== BlockIds.AIR && !this.isWaterBlock(blockId)
  }

  /**
   * Check if this water block has a source (water above or adjacent source at same/higher level).
   */
  private hasWaterSource(x: bigint, y: bigint, z: bigint, myLevel: number): boolean {
    // Water directly above is always a source
    const aboveId = this.getBlockId!(x, y + 1n, z)
    if (this.isWaterBlock(aboveId)) return true

    // Check horizontal neighbors for source blocks or higher level
    const neighbors = [
      { x: x + 1n, z },
      { x: x - 1n, z },
      { x, z: z + 1n },
      { x, z: z - 1n },
    ]

    for (const n of neighbors) {
      const nId = this.getBlockId!(n.x, y, n.z)
      const nLevel = this.getWaterLevel(nId)
      // Source block (level 8) or higher level water feeds us
      if (nLevel >= myLevel) return true
    }

    return false
  }

  /**
   * Process a single water block using Minecraft-style flow.
   * Returns true if any change occurred.
   */
  private processWaterBlock(x: bigint, y: bigint, z: bigint): boolean {
    const blockId = this.getBlockId!(x, y, z)
    const level = this.getWaterLevel(blockId)

    if (level <= 0) return false

    let changed = false
    const belowId = this.getBlockId!(x, y - 1n, z)

    // === STEP 0: SOURCE CREATION (Minecraft infinite water) ===
    // If this is flowing water on a solid block with 2+ adjacent source blocks, become a source
    if (level < WATER_LEVEL_MAX && this.isSolid(belowId)) {
      let sourceCount = 0

      // Check horizontal neighbors for sources
      const n1 = this.getBlockId!(x + 1n, y, z)
      const n2 = this.getBlockId!(x - 1n, y, z)
      const n3 = this.getBlockId!(x, y, z + 1n)
      const n4 = this.getBlockId!(x, y, z - 1n)

      if (this.getWaterLevel(n1) >= WATER_LEVEL_MAX) sourceCount++
      if (this.getWaterLevel(n2) >= WATER_LEVEL_MAX) sourceCount++
      if (this.getWaterLevel(n3) >= WATER_LEVEL_MAX) sourceCount++
      if (this.getWaterLevel(n4) >= WATER_LEVEL_MAX) sourceCount++

      // Also count water above as a source
      if (sourceCount < 2) {
        const aboveId = this.getBlockId!(x, y + 1n, z)
        if (this.isWaterBlock(aboveId)) sourceCount++
      }

      // 2+ sources = become a source block
      if (sourceCount >= 2) {
        if (this.setBlockRaw!(x, y, z, BlockIds.WATER)) {
          return true  // Changed to source, let next tick handle spreading
        }
        return false  // Already a source somehow
      }
    }

    // === STEP 1: FLOW DOWN ===
    if (belowId === BlockIds.AIR) {
      // Flow down into air - create full water (falling water is full)
      if (this.setBlockRaw!(x, y - 1n, z, BlockIds.WATER)) {
        changed = true
        this.queueColumnAt(x, z)  // Same column, but queue for next tick
      }
    } else if (this.isWaterBlock(belowId)) {
      // Below is water - make it full if not already
      const belowLevel = this.getWaterLevel(belowId)
      if (belowLevel < WATER_LEVEL_MAX) {
        if (this.setBlockRaw!(x, y - 1n, z, BlockIds.WATER)) {
          changed = true
        }
      }
    }

    // === STEP 2: HORIZONTAL SPREAD (only if can't flow down) ===
    if (this.isSolid(belowId) || this.getWaterLevel(belowId) >= WATER_LEVEL_MAX) {
      // Calculate the level we spread at
      const spreadLevel = level - 1

      if (spreadLevel >= WATER_LEVEL_MIN) {
        const neighbors = [
          { x: x + 1n, z },
          { x: x - 1n, z },
          { x, z: z + 1n },
          { x, z: z - 1n },
        ]

        for (const n of neighbors) {
          const nId = this.getBlockId!(n.x, y, n.z)
          const nLevel = this.getWaterLevel(nId)

          // Can spread into air or lower-level water
          if (nId === BlockIds.AIR) {
            if (this.setBlockRaw!(n.x, y, n.z, this.levelToBlockId(spreadLevel))) {
              changed = true
              this.queueColumnAt(n.x, n.z)  // Queue neighbor chunk for processing
            }
          } else if (this.isWaterBlock(nId) && nLevel < spreadLevel) {
            // Upgrade lower water to our spread level
            if (this.setBlockRaw!(n.x, y, n.z, this.levelToBlockId(spreadLevel))) {
              changed = true
              this.queueColumnAt(n.x, n.z)  // Queue neighbor chunk for processing
            }
          }
        }
      }
    }

    // === STEP 3: DRY UP if no source ===
    // Non-source water (level < 8) needs a source to persist
    if (level < WATER_LEVEL_MAX) {
      if (!this.hasWaterSource(x, y, z, level)) {
        // No source - dry up
        if (this.setBlockRaw!(x, y, z, BlockIds.AIR)) {
          changed = true
        }
      }
    }

    return changed
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
}
