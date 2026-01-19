import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for Hell pillar generation.
 */
export interface HellPillarFeatureConfig {
  /** Spacing between potential pillar centers in blocks. */
  gridSize: number
  /** Probability of a pillar spawning at a grid cell (0.0-1.0). */
  density: number
  /** Minimum base radius of pillars. */
  minRadius: number
  /** Maximum base radius of pillars. */
  maxRadius: number
  /** The Y level pillars reach up to (Layer 1 floor). */
  targetTopY: number
  /** Frequency of magma veins (higher = more veins). Default: 0.15 */
  magmaVeinFrequency?: number
  /** Noise threshold for magma placement (0.0-1.0). Default: 0.6 */
  magmaThreshold?: number
}

/**
 * Hell pillar feature that generates massive stone columns from the Hell terrain
 * up through the air gap to touch the surface layer floor.
 *
 * Algorithm:
 * 1. Use jittered grid placement for natural distribution
 * 2. Noise threshold determines spawn chance per grid cell
 * 3. Get terrain height at pillar center
 * 4. Generate tapered cylinder from terrain surface to targetTopY
 * 5. Radius decreases with height for natural taper
 */
export class HellPillarFeature extends Feature {
  private readonly config: HellPillarFeatureConfig

  constructor(config: HellPillarFeatureConfig) {
    super()
    this.config = config
  }

  /**
   * Deterministic random based on position (for reproducible placement).
   */
  private positionRandom(x: number, z: number, salt: number, seed: number): number {
    let hash = seed ^ (x * 73856093) ^ (z * 19349663) ^ (salt * 83492791)
    hash = ((hash ^ (hash >>> 16)) * 0x85ebca6b) >>> 0
    hash = ((hash ^ (hash >>> 13)) * 0xc2b2ae35) >>> 0
    return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, frameBudget, config } = context
    const { gridSize, density, minRadius, maxRadius, targetTopY } = this.config
    const coord = chunk.coordinate
    const seed = config.seed

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Get chunk world origin
    const chunkOrigin = localToWorld(coord, { x: 0, y: 0, z: 0 })
    const chunkBaseX = Number(chunkOrigin.x)
    const chunkBaseZ = Number(chunkOrigin.z)

    // Calculate grid cell range that could affect this chunk
    // We need to check pillars from nearby grid cells since large pillars can extend into this chunk
    const maxPillarRadius = maxRadius
    const gridStartX = Math.floor((chunkBaseX - maxPillarRadius) / gridSize) * gridSize
    const gridEndX = Math.floor((chunkBaseX + CHUNK_SIZE_X + maxPillarRadius) / gridSize) * gridSize
    const gridStartZ = Math.floor((chunkBaseZ - maxPillarRadius) / gridSize) * gridSize
    const gridEndZ = Math.floor((chunkBaseZ + CHUNK_SIZE_Z + maxPillarRadius) / gridSize) * gridSize

    frameBudget?.startFrame()

    // Check each grid cell for potential pillars
    for (let gridX = gridStartX; gridX <= gridEndX; gridX += gridSize) {
      for (let gridZ = gridStartZ; gridZ <= gridEndZ; gridZ += gridSize) {
        // Deterministic spawn chance based on grid cell
        const spawnChance = this.positionRandom(gridX, gridZ, 0, seed)
        if (spawnChance > density) continue

        // Jitter within grid cell for more natural placement
        const jitterX = Math.floor(this.positionRandom(gridX, gridZ, 1, seed) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(gridX, gridZ, 2, seed) * gridSize)
        const pillarWorldX = gridX + jitterX
        const pillarWorldZ = gridZ + jitterZ

        // Calculate pillar radius based on position
        const radiusRand = this.positionRandom(pillarWorldX, pillarWorldZ, 3, seed)
        const baseRadius = minRadius + Math.floor(radiusRand * (maxRadius - minRadius + 1))

        // Get terrain height at pillar center
        const terrainHeight = getBaseHeightAt(pillarWorldX, pillarWorldZ)
        const pillarBaseY = terrainHeight + 1

        // Pillar extends from terrain surface to targetTopY
        const totalHeight = targetTopY - pillarBaseY + 1
        if (totalHeight <= 0) continue

        // Generate pillar blocks that fall within this sub-chunk
        for (let worldY = Math.max(pillarBaseY, subChunkMinY); worldY <= Math.min(targetTopY, subChunkMaxY); worldY++) {
          // Calculate taper factor - radius decreases with height
          const heightRatio = (worldY - pillarBaseY) / totalHeight
          const radiusAtHeight = Math.max(1, Math.floor(baseRadius * (1 - heightRatio * 0.7)))

          // Check each block in the circular cross-section at this height
          for (let dx = -radiusAtHeight; dx <= radiusAtHeight; dx++) {
            for (let dz = -radiusAtHeight; dz <= radiusAtHeight; dz++) {
              // Check if within circular radius
              if (dx * dx + dz * dz > radiusAtHeight * radiusAtHeight) continue

              const blockWorldX = pillarWorldX + dx
              const blockWorldZ = pillarWorldZ + dz

              // Convert to local chunk coordinates
              const localX = blockWorldX - chunkBaseX
              const localZ = blockWorldZ - chunkBaseZ

              // Skip if outside this chunk's XZ bounds
              if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

              const localY = worldY - subChunkMinY

              // Only replace air blocks (don't carve into terrain)
              const currentBlock = chunk.getBlockId(localX, localY, localZ)
              if (currentBlock === BlockIds.AIR) {
                let blockId: number

                // Center column gets corrupted hell rock (the pillar's "spine")
                if (dx === 0 && dz === 0) {
                  blockId = BlockIds.CORRUPTED_HELL_ROCK
                } else {
                  // Determine if this block should be magma using vein-like noise
                  // Use stretched coordinates for vertical vein patterns
                  const veinFreq = this.config.magmaVeinFrequency ?? 0.08

                  // Primary vein noise - stretched in Y for vertical veins
                  const veinNoise1 = noise.noise3D(
                    blockWorldX * veinFreq,
                    worldY * veinFreq * 0.3, // Stretch vertically
                    blockWorldZ * veinFreq
                  )

                  // Secondary vein noise at different angle for crossing veins
                  const veinNoise2 = noise.noise3D(
                    (blockWorldX + worldY * 0.5) * veinFreq * 0.7,
                    worldY * veinFreq * 0.4,
                    (blockWorldZ + worldY * 0.3) * veinFreq * 0.7
                  )

                  // Use narrow band threshold for thin veins (~5% coverage)
                  // Veins appear where noise is close to 0
                  const veinWidth = 0.04 // Very narrow band for sparse veins
                  const isVein1 = Math.abs(veinNoise1) < veinWidth
                  const isVein2 = Math.abs(veinNoise2) < veinWidth * 0.5

                  // Place hell magma where veins occur, otherwise hell rock
                  blockId = (isVein1 || isVein2) ? BlockIds.HELL_MAGMA : BlockIds.HELL_ROCK
                }

                chunk.setBlockId(localX, localY, localZ, blockId)
              }
            }
          }
        }
      }
    }

    // Yield after processing
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }
}
