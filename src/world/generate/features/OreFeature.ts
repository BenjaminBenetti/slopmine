import { Feature, type FeatureContext } from './Feature.ts'
import type { BlockId } from '../../interfaces/IBlock.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Represents a placed ore block position (world coordinates).
 */
export interface OrePosition {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly blockId: BlockId
}

/**
 * Settings for ore feature generation.
 */
export interface OreFeatureSettings {
  /** The ore block to place (e.g., BlockIds.IRON_BLOCK) */
  readonly blockId: BlockId
  /** Number of vein spawn attempts per chunk */
  readonly frequency: number
  /** Average number of blocks per vein */
  readonly veinSize: number
  /** Minimum Y level for ore spawning */
  readonly minY: number
  /** Maximum Y level for ore spawning */
  readonly maxY: number
  /** Center Y level with highest spawn probability */
  readonly peakY: number
  /** Standard deviation for Gaussian Y distribution */
  readonly ySpread: number
  /** Blocks that can be replaced by this ore */
  readonly replaceableBlocks: readonly BlockId[]
}

/**
 * Ore feature that generates ore veins underground.
 * Uses Gaussian distribution for Y-level probability and blob algorithm for vein shape.
 */
export class OreFeature extends Feature {
  readonly settings: OreFeatureSettings

  constructor(settings: OreFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Deterministic random number based on position and salt.
   * Returns value in [0, 1).
   */
  private positionRandom(x: number, y: number, z: number, salt: number): number {
    // Simple hash-based PRNG
    const n = Math.sin(x * 12.9898 + y * 4.1414 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return n - Math.floor(n)
  }

  /**
   * Get Gaussian probability multiplier for a Y level.
   * Returns 1.0 at peakY, decreasing towards minY/maxY.
   */
  private getYProbability(y: number): number {
    const { peakY, ySpread } = this.settings
    const normalized = (y - peakY) / ySpread
    return Math.exp(-0.5 * normalized * normalized)
  }

  /**
   * Generate a vein of ore blocks starting from a seed position.
   * Uses blob algorithm - spreads to adjacent blocks with decreasing probability.
   * All Y coordinates are LOCAL to the sub-chunk (0-63).
   */
  private generateVein(
    context: FeatureContext,
    startX: number,
    startLocalY: number,
    startZ: number,
    worldYOffset: number,
    veinSalt: number,
    collector?: OrePosition[]
  ): void {
    const { chunk } = context
    const { blockId, veinSize, replaceableBlocks } = this.settings
    const coord = chunk.coordinate

    // Queue for BFS-style spreading (all Y values are LOCAL)
    const queue: Array<{ x: number; y: number; z: number }> = [
      { x: startX, y: startLocalY, z: startZ },
    ]
    const visited = new Set<string>()
    let placed = 0
    let iterations = 0
    const maxIterations = veinSize * 4 // Prevent infinite loops

    while (queue.length > 0 && placed < veinSize && iterations < maxIterations) {
      iterations++
      const pos = queue.shift()!
      const key = `${pos.x},${pos.y},${pos.z}`

      if (visited.has(key)) continue
      visited.add(key)

      // Check if position is within chunk bounds (Y is local: 0-63)
      if (pos.x < 0 || pos.x >= CHUNK_SIZE_X) continue
      if (pos.z < 0 || pos.z >= CHUNK_SIZE_Z) continue
      if (pos.y < 0 || pos.y >= SUB_CHUNK_HEIGHT) continue

      // Get current block at position
      const currentBlock = chunk.getBlockId(pos.x, pos.y, pos.z)

      // Check if we can replace this block
      if (!replaceableBlocks.includes(currentBlock)) continue

      // Place ore block
      chunk.setBlockId(pos.x, pos.y, pos.z, blockId)
      placed++

      // Collect world position if collector provided
      if (collector) {
        const worldY = pos.y + worldYOffset
        const worldCoord = localToWorld(coord, { x: pos.x, y: pos.y, z: pos.z })
        collector.push({
          x: Number(worldCoord.x),
          y: worldY,
          z: Number(worldCoord.z),
          blockId,
        })
      }

      // Add adjacent positions with spreading probability
      const neighbors = [
        { x: pos.x - 1, y: pos.y, z: pos.z },
        { x: pos.x + 1, y: pos.y, z: pos.z },
        { x: pos.x, y: pos.y - 1, z: pos.z },
        { x: pos.x, y: pos.y + 1, z: pos.z },
        { x: pos.x, y: pos.y, z: pos.z - 1 },
        { x: pos.x, y: pos.y, z: pos.z + 1 },
      ]

      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i]
        const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`

        if (visited.has(neighborKey)) continue

        // Spread probability decreases as we place more blocks
        const spreadChance = 0.7 - (placed / veinSize) * 0.3
        const rand = this.positionRandom(neighbor.x, neighbor.y, neighbor.z, veinSalt + i)

        if (rand < spreadChance) {
          queue.push(neighbor)
        }
      }
    }
  }

  /**
   * Core scan logic shared by scan() and scanWithPositions().
   * Handles sub-chunk Y range properly by converting world Y to local Y.
   */
  private scanInternal(context: FeatureContext, collector?: OrePosition[]): void {
    const { chunk } = context
    const { frequency, minY, maxY, peakY, ySpread } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    // Check if this is a sub-chunk coordinate (has subY property)
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Generate vein seed positions for this chunk
    // Use chunk coordinates as part of the seed for determinism
    const chunkSeedX = Number(coord.x)
    const chunkSeedZ = Number(coord.z)

    for (let attempt = 0; attempt < frequency; attempt++) {
      // Deterministic position within chunk
      const seedX = Math.floor(
        this.positionRandom(chunkSeedX, attempt, chunkSeedZ, 1) * CHUNK_SIZE_X
      )
      const seedZ = Math.floor(
        this.positionRandom(chunkSeedX, attempt, chunkSeedZ, 2) * CHUNK_SIZE_Z
      )

      // Sample Y from distribution, biased towards peakY
      // Use Box-Muller transform for Gaussian sampling
      const u1 = this.positionRandom(chunkSeedX + seedX, attempt, chunkSeedZ + seedZ, 3)
      const u2 = this.positionRandom(chunkSeedX + seedX, attempt, chunkSeedZ + seedZ, 4)

      // Box-Muller transform for normal distribution
      const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2)
      let seedWorldY = Math.round(peakY + z0 * ySpread)

      // Clamp to valid ore range
      seedWorldY = Math.max(minY, Math.min(maxY, seedWorldY))

      // Skip if seed Y is outside this sub-chunk's range
      if (seedWorldY < subChunkMinY || seedWorldY > subChunkMaxY) continue

      // Additional probability check based on Y level (makes edges rarer)
      const yProb = this.getYProbability(seedWorldY)
      const spawnCheck = this.positionRandom(seedX, seedWorldY, seedZ, 5)

      if (spawnCheck > yProb) continue

      // Convert world Y to local Y for this sub-chunk
      const seedLocalY = seedWorldY - subChunkMinY

      // Get world X/Z coordinates for salt calculation
      const worldCoord = localToWorld(coord, { x: seedX, y: seedLocalY, z: seedZ })
      const worldX = Number(worldCoord.x)
      const worldZ = Number(worldCoord.z)

      // Create a unique salt for this vein (use world Y for consistency)
      const veinSalt = worldX * 73856093 + seedWorldY * 19349663 + worldZ * 83492791 + attempt

      // Generate the vein (using local Y)
      this.generateVein(context, seedX, seedLocalY, seedZ, subChunkMinY, veinSalt, collector)
    }
  }

  async scan(context: FeatureContext): Promise<void> {
    const { frameBudget } = context

    frameBudget?.startFrame()
    this.scanInternal(context)

    // Yield after processing (only in main thread context)
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Scan and generate ores, returning positions of all placed ore blocks.
   * Used by worker to collect ore positions for debug visualization.
   */
  scanWithPositions(context: FeatureContext): OrePosition[] {
    const collector: OrePosition[] = []
    this.scanInternal(context, collector)
    return collector
  }
}
