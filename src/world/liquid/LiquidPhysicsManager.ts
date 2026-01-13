/**
 * Manages liquid physics simulation for all liquid blocks (water, lava, etc.).
 * Uses simple Minecraft-style flow: liquids slope down from source blocks.
 * No volume conservation - liquids just flow and dissipate.
 */

import type { BlockId } from '../interfaces/IBlock.ts'
import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { createChunkKey, type ChunkKey } from '../interfaces/ICoordinates.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { getBlock } from '../blocks/BlockRegistry.ts'
import { getLiquidBlockId } from './LiquidRegistry.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../interfaces/IChunk.ts'

export interface LiquidPhysicsConfig {
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
  /** Interval between background queue scans in ms (default: 2000) */
  backgroundScanIntervalMs: number
}

const DEFAULT_CONFIG: LiquidPhysicsConfig = {
  nearbyDistance: 2,
  maxDistance: 8,
  enabled: true,
  updateIntervalMs: 500,  // Cooldown for nearby/reactive updates
  backgroundUpdateIntervalMs: 5000,  // Cooldown for background updates (far chunks)
  backgroundScanIntervalMs: 2000,  // How often to scan for columns to queue
}

/**
 * Liquid levels - full source is 8, flowing liquid decreases to 1.
 * Level 0 = air (not a liquid).
 */
const LIQUID_LEVEL_MAX = 8
const LIQUID_LEVEL_MIN = 1

export class LiquidPhysicsManager {
  private readonly config: LiquidPhysicsConfig

  // Queue of chunk columns to process (deduplicated via Set)
  private readonly columnQueue: ChunkKey[] = []
  private readonly columnQueueSet: Set<ChunkKey> = new Set()

  // Per-column cooldown tracking (key -> last processed timestamp)
  private readonly lastProcessedTime: Map<ChunkKey, number> = new Map()

  // Stats tracking
  private columnsProcessedSinceLastQuery = 0

  // Player position for distance-based processing (in chunk coordinates)
  private playerChunkX = 0
  private playerChunkZ = 0

  // Background queue scanning
  private lastBackgroundScanTime = 0

  // Callbacks for world access
  private getBlockId: ((x: bigint, y: bigint, z: bigint) => BlockId) | null = null
  private setBlockRaw: ((x: bigint, y: bigint, z: bigint, blockId: BlockId) => boolean) | null = null
  private flushBlockChanges: (() => void) | null = null
  private isColumnLoaded: ((coord: IChunkCoordinate) => boolean) | null = null
  private getLiquidPositions: ((coord: IChunkCoordinate) => Array<{ x: number; worldY: number; z: number }>) | null = null
  private hasBlockTag: ((blockId: BlockId, tag: string) => boolean) | null = null
  private getLoadedColumnCoordinates: (() => IChunkCoordinate[]) | null = null

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
    hasBlockTag: (blockId: BlockId, tag: string) => boolean,
    getLoadedColumnCoordinates: () => IChunkCoordinate[]
  ): void {
    this.getBlockId = getBlockId
    this.setBlockRaw = setBlockRaw
    this.flushBlockChanges = flushBlockChanges
    this.isColumnLoaded = isColumnLoaded
    this.getLiquidPositions = getLiquidPositions
    this.hasBlockTag = hasBlockTag
    this.getLoadedColumnCoordinates = getLoadedColumnCoordinates
  }

  /**
   * Update the player position for distance-based processing.
   * @param worldX World X coordinate of the player
   * @param worldZ World Z coordinate of the player
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
   * Periodically scan loaded columns and queue those within range for background processing.
   * Call this every frame to enable background liquid physics updates.
   */
  updateQueue(): void {
    if (!this.config.enabled) return
    if (!this.getLoadedColumnCoordinates) return

    const now = performance.now()

    // Only scan periodically to avoid overhead
    if (now - this.lastBackgroundScanTime < this.config.backgroundScanIntervalMs) {
      return
    }
    this.lastBackgroundScanTime = now

    // Get all loaded columns and queue those within range
    const loadedColumns = this.getLoadedColumnCoordinates()
    for (const coord of loadedColumns) {
      const chunkX = Number(coord.x)
      const chunkZ = Number(coord.z)
      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distance = Math.sqrt(dx * dx + dz * dz)

      // Only queue columns within max processing distance
      if (distance <= this.config.maxDistance) {
        this.queueColumn(coord.x, coord.z)
      }
    }
  }

  /**
   * Process the next chunk column in the queue with distance-based cooldowns.
   * Nearby columns use shorter cooldowns for reactive updates.
   * Far columns use longer cooldowns for background processing.
   */
  processNextColumn(): boolean {
    if (!this.config.enabled) return false
    if (!this.getBlockId || !this.setBlockRaw || !this.flushBlockChanges || !this.isColumnLoaded || !this.getLiquidPositions) return false
    if (this.columnQueue.length === 0) return false

    const now = performance.now()

    // Find first column that's not on cooldown (with distance-based cooldowns)
    let keyToProcess: ChunkKey | null = null
    let keysSkipped = 0

    for (let i = 0; i < this.columnQueue.length; i++) {
      const key = this.columnQueue[i]
      const [xStr, zStr] = key.split(',')
      const chunkX = Number(xStr)
      const chunkZ = Number(zStr)

      // Calculate distance from player
      const dx = chunkX - this.playerChunkX
      const dz = chunkZ - this.playerChunkZ
      const distance = Math.sqrt(dx * dx + dz * dz)

      // Skip columns beyond max processing distance
      if (distance > this.config.maxDistance) {
        keysSkipped++
        if (keysSkipped >= 10) break
        continue
      }

      // Use shorter cooldown for nearby chunks, longer for background
      const isNearby = distance <= this.config.nearbyDistance
      const baseCooldown = isNearby
        ? this.config.updateIntervalMs
        : this.config.backgroundUpdateIntervalMs

      // Add deterministic jitter based on chunk coordinates to spread reprocessing
      // Nearby chunks use higher jitter (0-100%) to spread across the window
      // Far chunks use lower jitter (0-50%) for more consistent timing
      const jitterSeed = (chunkX * 73856093) ^ (chunkZ * 19349663)
      const jitterPercent = isNearby
        ? (Math.abs(jitterSeed) % 100) / 100
        : (Math.abs(jitterSeed) % 50) / 100
      const effectiveCooldown = baseCooldown + baseCooldown * jitterPercent

      const lastTime = this.lastProcessedTime.get(key) ?? 0
      if (now - lastTime >= effectiveCooldown) {
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

    // Only re-queue self if liquid changed
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
   * Process all liquid blocks in a chunk column.
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
      if (this.isLiquidBlock(blockId)) {
        if (this.processLiquidBlock(worldX, worldY, worldZ)) {
          anyChanged = true
        }
      }
    }

    return anyChanged
  }

  /**
   * Get the liquid level (1-8) for a block ID. 0 = not a liquid.
   */
  private getLiquidLevel(blockId: BlockId): number {
    return getBlock(blockId).properties.liquidLevel ?? 0
  }

  /**
   * Get the liquid family (e.g., 'water', 'lava') for a block ID.
   * Returns undefined if not a liquid.
   */
  private getLiquidFamily(blockId: BlockId): string | undefined {
    return getBlock(blockId).properties.liquidFamily
  }

  /**
   * Check if a block is any type of liquid.
   */
  private isLiquidBlock(blockId: BlockId): boolean {
    return getBlock(blockId).properties.isLiquid
  }

  /**
   * Check if a block is solid (can't flow into).
   * A block is solid if it's not air and not a liquid.
   */
  private isSolid(blockId: BlockId): boolean {
    return blockId !== BlockIds.AIR && !this.isLiquidBlock(blockId)
  }

  /**
   * Check if this liquid block has a source (liquid of same family above or adjacent at same/higher level).
   */
  private hasLiquidSource(x: bigint, y: bigint, z: bigint, myLevel: number, myFamily: string): boolean {
    // Liquid directly above of same family is always a source
    const aboveId = this.getBlockId!(x, y + 1n, z)
    if (this.getLiquidFamily(aboveId) === myFamily) return true

    // Check horizontal neighbors for source blocks or higher level of same family
    const neighbors = [
      { x: x + 1n, z },
      { x: x - 1n, z },
      { x, z: z + 1n },
      { x, z: z - 1n },
    ]

    for (const n of neighbors) {
      const nId = this.getBlockId!(n.x, y, n.z)
      const nFamily = this.getLiquidFamily(nId)
      if (nFamily !== myFamily) continue

      const nLevel = this.getLiquidLevel(nId)
      // Source block (level 8) or higher level liquid feeds us
      if (nLevel >= myLevel) return true
    }

    return false
  }

  /**
   * Process a single liquid block using Minecraft-style flow.
   * Returns true if any change occurred.
   */
  private processLiquidBlock(x: bigint, y: bigint, z: bigint): boolean {
    const blockId = this.getBlockId!(x, y, z)
    const level = this.getLiquidLevel(blockId)
    const family = this.getLiquidFamily(blockId)

    if (level <= 0 || !family) return false

    let changed = false
    const belowId = this.getBlockId!(x, y - 1n, z)
    const belowFamily = this.getLiquidFamily(belowId)

    // Get the source block ID for this liquid family
    const sourceBlockId = getLiquidBlockId(family, LIQUID_LEVEL_MAX)

    // === STEP 0: SOURCE CREATION (Minecraft infinite liquid) ===
    // If this is flowing liquid on a solid block with 2+ adjacent source blocks of same family, become a source
    if (level < LIQUID_LEVEL_MAX && this.isSolid(belowId)) {
      let sourceCount = 0

      // Check horizontal neighbors for sources of same family
      const n1 = this.getBlockId!(x + 1n, y, z)
      const n2 = this.getBlockId!(x - 1n, y, z)
      const n3 = this.getBlockId!(x, y, z + 1n)
      const n4 = this.getBlockId!(x, y, z - 1n)

      if (this.getLiquidFamily(n1) === family && this.getLiquidLevel(n1) >= LIQUID_LEVEL_MAX) sourceCount++
      if (this.getLiquidFamily(n2) === family && this.getLiquidLevel(n2) >= LIQUID_LEVEL_MAX) sourceCount++
      if (this.getLiquidFamily(n3) === family && this.getLiquidLevel(n3) >= LIQUID_LEVEL_MAX) sourceCount++
      if (this.getLiquidFamily(n4) === family && this.getLiquidLevel(n4) >= LIQUID_LEVEL_MAX) sourceCount++

      // Also count liquid above of same family as a source
      if (sourceCount < 2) {
        const aboveId = this.getBlockId!(x, y + 1n, z)
        if (this.getLiquidFamily(aboveId) === family) sourceCount++
      }

      // 2+ sources = become a source block
      if (sourceCount >= 2) {
        if (this.setBlockRaw!(x, y, z, sourceBlockId)) {
          return true  // Changed to source, let next tick handle spreading
        }
        return false  // Already a source somehow
      }
    }

    // === STEP 1: FLOW DOWN ===
    if (belowId === BlockIds.AIR) {
      // Flow down into air - create full liquid (falling liquid is full)
      if (this.setBlockRaw!(x, y - 1n, z, sourceBlockId)) {
        changed = true
        this.queueColumnAt(x, z)  // Same column, but queue for next tick
      }
    } else if (belowFamily === family) {
      // Below is same liquid family - make it full if not already
      const belowLevel = this.getLiquidLevel(belowId)
      if (belowLevel < LIQUID_LEVEL_MAX) {
        if (this.setBlockRaw!(x, y - 1n, z, sourceBlockId)) {
          changed = true
        }
      }
    }

    // === STEP 2: HORIZONTAL SPREAD (only if can't flow down) ===
    if (this.isSolid(belowId) || (belowFamily === family && this.getLiquidLevel(belowId) >= LIQUID_LEVEL_MAX)) {
      // Calculate the level we spread at
      const spreadLevel = level - 1

      if (spreadLevel >= LIQUID_LEVEL_MIN) {
        const spreadBlockId = getLiquidBlockId(family, spreadLevel)
        const neighbors = [
          { x: x + 1n, z },
          { x: x - 1n, z },
          { x, z: z + 1n },
          { x, z: z - 1n },
        ]

        for (const n of neighbors) {
          const nId = this.getBlockId!(n.x, y, n.z)
          const nFamily = this.getLiquidFamily(nId)
          const nLevel = this.getLiquidLevel(nId)

          // Can spread into air
          if (nId === BlockIds.AIR) {
            if (this.setBlockRaw!(n.x, y, n.z, spreadBlockId)) {
              changed = true
              this.queueColumnAt(n.x, n.z)  // Queue neighbor chunk for processing
            }
          } else if (nFamily === family && nLevel < spreadLevel) {
            // Upgrade lower liquid of same family to our spread level
            if (this.setBlockRaw!(n.x, y, n.z, spreadBlockId)) {
              changed = true
              this.queueColumnAt(n.x, n.z)  // Queue neighbor chunk for processing
            }
          }
        }
      }
    }

    // === STEP 3: DRY UP if no source ===
    // Non-source liquid (level < 8) needs a source to persist
    if (level < LIQUID_LEVEL_MAX) {
      if (!this.hasLiquidSource(x, y, z, level, family)) {
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
