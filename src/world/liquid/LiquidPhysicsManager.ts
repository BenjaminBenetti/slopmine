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
  updateIntervalMs: 25,
}

/**
 * Water level constants for volume calculations.
 * Levels are in "units" where Full = 4 units.
 * Intermediate "odd eighth" levels allow even distribution between adjacent levels.
 */
const WATER_LEVELS = {
  FULL: 4,
  SEVEN_EIGHTH: 3.5,
  THREE_QUARTER: 3,
  FIVE_EIGHTH: 2.5,
  HALF: 2,
  THREE_EIGHTH: 1.5,
  QUARTER: 1,
  EIGHTH: 0.5,
  AIR: 0,
} as const

/** Distance to search when calculating connected water volume */
const EVAPORATION_SEARCH_DISTANCE = 4

/** Minimum water volume to avoid evaporation (4 = one full block worth) */
const EVAPORATION_VOLUME_THRESHOLD = 4

/**
 * W-Shadow Compressibility Model Constants
 * Based on: https://w-shadow.com/blog/2009/09/01/simple-fluid-simulation/
 *
 * The key insight: treat water as slightly compressible. Bottom cells can hold
 * slightly more water than cells above them. This naturally creates pressure
 * without explicit pressure tracking.
 *
 * We use integer "half-units" internally to prevent floating-point water loss.
 * Each half-unit = 0.5 water level, so full water (4) = 8 half-units.
 */
/** Maximum water a cell can hold normally (uncompressed) */
const MAX_MASS = WATER_LEVELS.FULL  // 4 units = 8 half-units

/** Extra water a compressed cell can hold compared to cell above it */
const MAX_COMPRESS = 0.1  // Small compression allowance for pressure simulation

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

    // Find columns to process - prioritize nearby but don't starve distant ones
    // Collect all valid (not on cooldown, within range) columns
    const validIndices: Array<{ index: number; distance: number }> = []

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

      validIndices.push({ index: i, distance })
    }

    // No valid column found (all on cooldown or too far)
    if (validIndices.length === 0) {
      return this.columnQueue.length > 0
    }

    // Separate into nearby (within ~1.5 chunks = 3x3 area) and distant
    const nearbyThreshold = 1.5
    const nearby = validIndices.filter((v) => v.distance <= nearbyThreshold)
    const distant = validIndices.filter((v) => v.distance > nearbyThreshold)

    // Pick from nearby columns equally (random selection for fairness)
    // If no nearby, pick from distant (sorted by distance)
    let bestIndex: number
    if (nearby.length > 0) {
      // Random selection among nearby columns - all get equal priority
      const randomIdx = Math.floor(Math.random() * nearby.length)
      bestIndex = nearby[randomIdx].index
    } else if (distant.length > 0) {
      // Sort distant by distance, pick nearest
      distant.sort((a, b) => a.distance - b.distance)
      bestIndex = distant[0].index
    } else {
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
   * Includes intermediate "odd eighth" levels for smooth distribution.
   */
  private getWaterLevel(blockId: BlockId): number {
    switch (blockId) {
      case BlockIds.WATER:
        return WATER_LEVELS.FULL
      case BlockIds.WATER_SEVEN_EIGHTH:
        return WATER_LEVELS.SEVEN_EIGHTH
      case BlockIds.WATER_THREE_QUARTER:
        return WATER_LEVELS.THREE_QUARTER
      case BlockIds.WATER_FIVE_EIGHTH:
        return WATER_LEVELS.FIVE_EIGHTH
      case BlockIds.WATER_HALF:
        return WATER_LEVELS.HALF
      case BlockIds.WATER_THREE_EIGHTH:
        return WATER_LEVELS.THREE_EIGHTH
      case BlockIds.WATER_QUARTER:
        return WATER_LEVELS.QUARTER
      case BlockIds.WATER_EIGHTH:
        return WATER_LEVELS.EIGHTH
      default:
        return WATER_LEVELS.AIR
    }
  }

  /**
   * Convert a water level (0-4) to a block ID.
   * Includes intermediate "odd eighth" levels for smooth distribution.
   */
  private levelToBlockId(level: number): BlockId {
    if (level >= WATER_LEVELS.FULL) return BlockIds.WATER
    if (level >= WATER_LEVELS.SEVEN_EIGHTH) return BlockIds.WATER_SEVEN_EIGHTH
    if (level >= WATER_LEVELS.THREE_QUARTER) return BlockIds.WATER_THREE_QUARTER
    if (level >= WATER_LEVELS.FIVE_EIGHTH) return BlockIds.WATER_FIVE_EIGHTH
    if (level >= WATER_LEVELS.HALF) return BlockIds.WATER_HALF
    if (level >= WATER_LEVELS.THREE_EIGHTH) return BlockIds.WATER_THREE_EIGHTH
    if (level >= WATER_LEVELS.QUARTER) return BlockIds.WATER_QUARTER
    if (level >= WATER_LEVELS.EIGHTH) return BlockIds.WATER_EIGHTH
    return BlockIds.AIR
  }

  /**
   * Check if a block ID is a liquid block.
   */
  private isLiquidBlock(blockId: BlockId): boolean {
    return (
      blockId === BlockIds.WATER ||
      blockId === BlockIds.WATER_SEVEN_EIGHTH ||
      blockId === BlockIds.WATER_THREE_QUARTER ||
      blockId === BlockIds.WATER_FIVE_EIGHTH ||
      blockId === BlockIds.WATER_HALF ||
      blockId === BlockIds.WATER_THREE_EIGHTH ||
      blockId === BlockIds.WATER_QUARTER ||
      blockId === BlockIds.WATER_EIGHTH
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
   * Calculate total water volume connected to this block.
   * Uses BFS with distance limit for performance.
   */
  private getConnectedWaterVolume(x: bigint, y: bigint, z: bigint, maxDistance: number): number {
    const visited = new Set<string>()
    const queue: Array<{ x: bigint; y: bigint; z: bigint; dist: number }> = []
    let totalVolume = 0

    const key = (px: bigint, py: bigint, pz: bigint) => `${px},${py},${pz}`

    // Start with current block
    const startLevel = this.getWaterLevel(this.getBlockId!(x, y, z))
    if (startLevel === 0) return 0

    visited.add(key(x, y, z))
    totalVolume += startLevel
    queue.push({ x, y, z, dist: 0 })

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.dist >= maxDistance) continue

      // Check all 6 neighbors
      const neighbors = [
        { x: current.x + 1n, y: current.y, z: current.z },
        { x: current.x - 1n, y: current.y, z: current.z },
        { x: current.x, y: current.y + 1n, z: current.z },
        { x: current.x, y: current.y - 1n, z: current.z },
        { x: current.x, y: current.y, z: current.z + 1n },
        { x: current.x, y: current.y, z: current.z - 1n },
      ]

      for (const n of neighbors) {
        const nKey = key(n.x, n.y, n.z)
        if (visited.has(nKey)) continue
        visited.add(nKey)

        const nBlockId = this.getBlockId!(n.x, n.y, n.z)
        const nLevel = this.getWaterLevel(nBlockId)

        if (nLevel > 0) {
          totalVolume += nLevel
          queue.push({ x: n.x, y: n.y, z: n.z, dist: current.dist + 1 })
        }
      }
    }

    return totalVolume
  }

  /**
   * Calculate the stable water level for the bottom cell of two vertically adjacent cells.
   * This is the core of the W-Shadow compressibility model.
   *
   * When two cells are stacked, this function determines how the water should
   * distribute between them to reach equilibrium. Bottom cells can hold slightly
   * more water than normal when under pressure from above.
   *
   * @param totalMass Combined water in both cells
   * @returns How much water the bottom cell should hold
   */
  private getStableStateBottom(totalMass: number): number {
    if (totalMass <= MAX_MASS) {
      // All water fits in bottom cell
      return totalMass
    } else if (totalMass < 2 * MAX_MASS + MAX_COMPRESS) {
      // Some water in top, bottom gets compressed
      // Formula: (MaxMass² + totalMass*MaxCompress) / (MaxMass + MaxCompress)
      return (MAX_MASS * MAX_MASS + totalMass * MAX_COMPRESS) / (MAX_MASS + MAX_COMPRESS)
    } else {
      // Both cells near full, split evenly with compression bonus to bottom
      return (totalMass + MAX_COMPRESS) / 2
    }
  }

  /**
   * Process liquid flow for a single block using W-Shadow compressibility model.
   * Uses integer half-units to prevent water loss from floating-point rounding.
   * Flow order: Down -> Horizontal -> Up (only for compressed water)
   * @returns true if any flow occurred
   */
  private processFlow(x: bigint, y: bigint, z: bigint): boolean {
    const blockId = this.getBlockId!(x, y, z)
    const level = this.getWaterLevel(blockId)

    // Not a liquid block or empty, nothing to do
    if (level <= 0) return false

    // Work in half-units (integers) to prevent floating-point water loss
    // Each half-unit = 0.5 level, so full water (4) = 8 half-units
    let selfHalfUnits = Math.round(level * 2)
    const originalSelfHalfUnits = selfHalfUnits

    let changed = false

    // === STEP 1: FLOW DOWN (highest priority) ===
    const belowId = this.getBlockId!(x, y - 1n, z)
    const belowLevel = this.getWaterLevel(belowId)

    // Can flow down into air or partial water (with compression allowance)
    const maxHalfUnits = Math.round((MAX_MASS + MAX_COMPRESS) * 2)  // ~8 half-units
    if (belowId === BlockIds.AIR || (this.isLiquidBlock(belowId) && belowLevel < MAX_MASS + MAX_COMPRESS)) {
      let belowHalfUnits = Math.round(belowLevel * 2)

      // Calculate stable distribution using compressibility model
      const totalMass = (selfHalfUnits + belowHalfUnits) * 0.5
      const stableBottom = this.getStableStateBottom(totalMass)
      const stableBottomHalfUnits = Math.round(stableBottom * 2)

      // How many half-units should flow down
      let flowHalfUnits = stableBottomHalfUnits - belowHalfUnits

      // Clamp to available water
      flowHalfUnits = Math.min(flowHalfUnits, selfHalfUnits)
      flowHalfUnits = Math.max(0, flowHalfUnits)

      // Only flow at least 1 half-unit (0.5 level)
      if (flowHalfUnits >= 1) {
        belowHalfUnits += flowHalfUnits
        selfHalfUnits -= flowHalfUnits

        this.setBlockRaw!(x, y - 1n, z, this.levelToBlockId(belowHalfUnits * 0.5))
        changed = true
      }
    }

    // If we emptied out, update self and done
    if (selfHalfUnits <= 0) {
      if (changed) {
        this.setBlockRaw!(x, y, z, BlockIds.AIR)
      }
      return changed
    }

    // === STEP 2: HORIZONTAL FLOW ===
    // Get horizontal neighbors
    const horizontalNeighbors = [
      { x: x + 1n, z },
      { x: x - 1n, z },
      { x, z: z + 1n },
      { x, z: z - 1n },
    ].map((n) => {
      const id = this.getBlockId!(n.x, y, n.z)
      return {
        x: n.x,
        z: n.z,
        blockId: id,
        halfUnits: Math.round(this.getWaterLevel(id) * 2),
        canFlow: this.canFlowInto(id),
      }
    })

    // Filter to neighbors we can flow to (lower level and can receive water)
    const flowableNeighbors = horizontalNeighbors.filter(
      (n) => n.canFlow && n.halfUnits < selfHalfUnits
    )

    if (flowableNeighbors.length > 0) {
      // Sort by level (lowest first) - prioritize flowing to lowest points
      flowableNeighbors.sort((a, b) => a.halfUnits - b.halfUnits)

      // Calculate total water available for horizontal distribution
      const totalHalfUnits = selfHalfUnits + flowableNeighbors.reduce((sum, n) => sum + n.halfUnits, 0)
      const cellCount = flowableNeighbors.length + 1

      // Target: everyone gets the same amount (or as close as possible)
      const baseHalfUnits = Math.floor(totalHalfUnits / cellCount)
      let remainder = totalHalfUnits % cellCount

      // Only flow if we're above the target level
      if (selfHalfUnits > baseHalfUnits) {
        // Flow to each neighbor to bring them up to base level
        for (const neighbor of flowableNeighbors) {
          if (selfHalfUnits <= baseHalfUnits) break

          // How much does this neighbor need to reach base (or base+1 for remainder)?
          let targetHalfUnits = baseHalfUnits
          if (remainder > 0 && neighbor.halfUnits < baseHalfUnits + 1) {
            targetHalfUnits = baseHalfUnits + 1
            remainder--
          }

          // Flow the difference
          const need = targetHalfUnits - neighbor.halfUnits
          if (need > 0) {
            const flowHalfUnits = Math.min(need, selfHalfUnits - baseHalfUnits)
            if (flowHalfUnits >= 1) {
              neighbor.halfUnits += flowHalfUnits
              selfHalfUnits -= flowHalfUnits
              this.setBlockRaw!(neighbor.x, y, neighbor.z, this.levelToBlockId(neighbor.halfUnits * 0.5))
              changed = true
            }
          }
        }
      }
    }

    // === STEP 3: FLOW UP (only for compressed water) ===
    // Water only flows up if cell has MORE than MAX_MASS (is compressed)
    const maxNormalHalfUnits = Math.round(MAX_MASS * 2)  // 8 half-units
    if (selfHalfUnits > maxNormalHalfUnits) {
      const aboveId = this.getBlockId!(x, y + 1n, z)
      const aboveLevel = this.getWaterLevel(aboveId)

      // Can flow up into air or partial water
      if (aboveId === BlockIds.AIR || (this.isLiquidBlock(aboveId) && aboveLevel < MAX_MASS)) {
        let aboveHalfUnits = Math.round(aboveLevel * 2)

        // Flow excess compression upward
        let flowHalfUnits = selfHalfUnits - maxNormalHalfUnits

        // Clamp to capacity above
        const aboveCapacity = maxNormalHalfUnits - aboveHalfUnits
        flowHalfUnits = Math.min(flowHalfUnits, aboveCapacity)

        if (flowHalfUnits >= 1) {
          aboveHalfUnits += flowHalfUnits
          selfHalfUnits -= flowHalfUnits

          this.setBlockRaw!(x, y + 1n, z, this.levelToBlockId(aboveHalfUnits * 0.5))
          changed = true
        }
      }
    }

    // Final update to self if changed
    if (selfHalfUnits !== originalSelfHalfUnits) {
      if (selfHalfUnits <= 0) {
        this.setBlockRaw!(x, y, z, BlockIds.AIR)
      } else {
        this.setBlockRaw!(x, y, z, this.levelToBlockId(selfHalfUnits * 0.5))
      }
      changed = true
    }

    // === STEP 4: EVAPORATION for small isolated puddles ===
    if (!changed && selfHalfUnits <= 2) {  // Quarter or less
      const volume = this.getConnectedWaterVolume(x, y, z, EVAPORATION_SEARCH_DISTANCE)
      if (volume < EVAPORATION_VOLUME_THRESHOLD) {
        // Reduce by one half-unit
        selfHalfUnits = Math.max(0, selfHalfUnits - 1)
        if (selfHalfUnits <= 0) {
          this.setBlockRaw!(x, y, z, BlockIds.AIR)
        } else {
          this.setBlockRaw!(x, y, z, this.levelToBlockId(selfHalfUnits * 0.5))
        }
        return true
      }
    }

    return changed
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
