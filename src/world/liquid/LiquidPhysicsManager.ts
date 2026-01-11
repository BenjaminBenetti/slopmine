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
   * Process liquid flow for a single block using even distribution algorithm.
   * Flow priority: Down first, then horizontal spread to ALL valid neighbors.
   * Also handles evaporation for quarter and eighth blocks.
   * @returns true if any flow occurred
   */
  private processFlow(x: bigint, y: bigint, z: bigint): boolean {
    const blockId = this.getBlockId!(x, y, z)
    const level = this.getWaterLevel(blockId)

    // Not a liquid block, nothing to do
    if (level === 0) return false

    // === EIGHTH BLOCKS: Only fall down, no horizontal flow ===
    if (blockId === BlockIds.WATER_EIGHTH) {
      const belowId = this.getBlockId!(x, y - 1n, z)
      const belowLevel = this.getWaterLevel(belowId)

      // Fall into empty space
      if (belowId === BlockIds.AIR) {
        this.setBlockRaw!(x, y - 1n, z, BlockIds.WATER_EIGHTH)
        this.setBlockRaw!(x, y, z, BlockIds.AIR)
        return true
      }

      // Combine with partial water below
      if (belowLevel > 0 && belowLevel < WATER_LEVELS.FULL) {
        const total = level + belowLevel
        this.setBlockRaw!(x, y - 1n, z, this.levelToBlockId(total))
        this.setBlockRaw!(x, y, z, BlockIds.AIR)
        return true
      }

      // Stuck - check evaporation
      const volume = this.getConnectedWaterVolume(x, y, z, EVAPORATION_SEARCH_DISTANCE)
      if (volume < EVAPORATION_VOLUME_THRESHOLD) {
        this.setBlockRaw!(x, y, z, BlockIds.AIR)
        return true
      }
      // Eighth blocks don't flow horizontally, just stay put
      return false
    }

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

    // === STEP 2: HORIZONTAL SPREAD ===
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

    // Shuffle flow targets to avoid directional bias (X-axis banding)
    for (let i = flowTargets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[flowTargets[i], flowTargets[j]] = [flowTargets[j], flowTargets[i]]
    }

    // === EVAPORATION: Check only when STUCK (can't flow down or horizontally) ===
    if (flowTargets.length === 0) {
      // Quarter blocks: start evaporating if isolated
      if (blockId === BlockIds.WATER_QUARTER) {
        const volume = this.getConnectedWaterVolume(x, y, z, EVAPORATION_SEARCH_DISTANCE)
        if (volume < EVAPORATION_VOLUME_THRESHOLD) {
          // Too small and stuck - become eighth (warning state)
          this.setBlockRaw!(x, y, z, BlockIds.WATER_EIGHTH)
          return true
        }
      }
      return false
    }

    // === QUARTER BLOCK SPECIAL CASE: Split into eighths when flowing to air ===
    // This prevents oscillation - eighths don't flow horizontally
    if (blockId === BlockIds.WATER_QUARTER) {
      const airTargets = flowTargets.filter((n) => n.level === 0)
      if (airTargets.length > 0) {
        // Split: self becomes eighth, first air target becomes eighth
        this.setBlockRaw!(x, y, z, BlockIds.WATER_EIGHTH)
        this.setBlockRaw!(airTargets[0].x, y, airTargets[0].z, BlockIds.WATER_EIGHTH)
        return true
      }
      // If no air targets, quarter flows into lower water normally (below)
    }

    // Calculate total water and even distribution
    // Work in "half-units" (0.5 increments) to preserve water volume
    const totalWater = level + flowTargets.reduce((sum, n) => sum + n.level, 0)
    const totalHalfUnits = Math.round(totalWater * 2) // Convert to half-units
    const cellCount = flowTargets.length + 1 // targets + self

    // Calculate even split in half-units
    const baseHalfUnits = Math.floor(totalHalfUnits / cellCount)
    const remainderHalfUnits = totalHalfUnits % cellCount

    // STABILITY CHECK: Only flow if self is actually above the base level
    // This prevents oscillation while still allowing equalization
    const selfHalfUnits = Math.round(level * 2)
    if (selfHalfUnits <= baseHalfUnits) {
      return false // Self is already at or below even distribution
    }

    // Assign levels - give remainder to targets first (favor flowing outward)
    let remainingRemainder = remainderHalfUnits
    const targetLevels: number[] = []
    for (let i = 0; i < flowTargets.length; i++) {
      const halfUnits = baseHalfUnits + (remainingRemainder > 0 ? 1 : 0)
      if (remainingRemainder > 0) remainingRemainder--
      targetLevels.push(halfUnits * 0.5) // Convert back to units
    }

    // Self gets what's left (base only, since remainder went to targets)
    const selfLevel = baseHalfUnits * 0.5

    // Only proceed if something actually changes
    if (Math.abs(selfLevel - level) < 0.01) return false

    this.setBlockRaw!(x, y, z, this.levelToBlockId(selfLevel))

    for (let i = 0; i < flowTargets.length; i++) {
      this.setBlockRaw!(flowTargets[i].x, y, flowTargets[i].z, this.levelToBlockId(targetLevels[i]))
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
