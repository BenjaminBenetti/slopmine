import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for lava pool generation.
 */
export interface LavaFeatureConfig {
  /** Controls how common lava pools are (0.0-1.0). Higher = more pools. */
  frequency: number
  /** Minimum depth of depression required for lava to spawn. */
  minDepth: number
  /** The Y level at which lava surfaces will appear. */
  lavaLevel: number
}

/**
 * Lava feature that fills terrain depressions with lava.
 * Similar to WaterFeature but for volcanic biomes.
 *
 * Algorithm:
 * 1. Use low-frequency noise to define lava pool regions
 * 2. For each column (x,z), check if it's in a lava region
 * 3. Check if the depression is deep enough (minDepth requirement)
 * 4. If terrain height < lava level, fill from terrain+1 up to lava level
 * 5. Only fill AIR blocks (don't replace solid blocks)
 */
export class LavaFeature extends Feature {
  private readonly config: LavaFeatureConfig

  constructor(config: LavaFeatureConfig) {
    super()
    this.config = config
  }

  /**
   * Check if a grid cell qualifies for lava based on noise and minDepth.
   */
  private cellHasLava(
    gridX: number,
    gridZ: number,
    gridSize: number,
    lavaLevel: number,
    minDepth: number,
    noiseThreshold: number,
    noise: FeatureContext['noise'],
    getBaseHeightAt: (x: number, z: number) => number
  ): boolean {
    // First check noise threshold - using different offset for variety
    const lavaNoise = noise.noise2D(gridX * 0.008 + 500, gridZ * 0.008 + 500)
    if (lavaNoise < noiseThreshold) {
      return false
    }

    // Check if there's at least one deep enough depression in this cell
    const samplePoints = [
      [gridX, gridZ],
      [gridX + gridSize - 1, gridZ],
      [gridX, gridZ + gridSize - 1],
      [gridX + gridSize - 1, gridZ + gridSize - 1],
      [gridX + Math.floor(gridSize / 2), gridZ + Math.floor(gridSize / 2)],
    ]

    for (const [x, z] of samplePoints) {
      const terrainHeight = getBaseHeightAt(x, z)
      const depth = lavaLevel - terrainHeight
      if (depth >= minDepth) {
        return true
      }
    }
    return false
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, noise, frameBudget } = context
    const { frequency, minDepth, lavaLevel } = this.config
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Skip if lava level is entirely outside this sub-chunk's range
    if (lavaLevel < subChunkMinY) return

    // Convert frequency (0-1) to a noise threshold
    const noiseThreshold = 1 - frequency * 2

    // Grid size for lava region decisions
    const gridSize = 96 // Smaller than water for more focused pools

    // Cache grid cell lava decisions
    const gridCache = new Map<string, boolean>()

    const isLavaRegion = (worldX: number, worldZ: number): boolean => {
      const gridX = Math.floor(worldX / gridSize) * gridSize
      const gridZ = Math.floor(worldZ / gridSize) * gridSize
      const key = `${gridX},${gridZ}`

      let result = gridCache.get(key)
      if (result === undefined) {
        result = this.cellHasLava(
          gridX, gridZ, gridSize, lavaLevel, minDepth,
          noiseThreshold, noise, getBaseHeightAt
        )
        gridCache.set(key, result)
      }
      return result
    }

    // Check if this chunk should have lava
    const chunkOrigin = localToWorld(coord, { x: 0, y: 0, z: 0 })
    const chunkBaseX = Number(chunkOrigin.x)
    const chunkBaseZ = Number(chunkOrigin.z)

    let chunkHasLava = false

    // Check chunk corners
    const corners = [
      [chunkBaseX, chunkBaseZ],
      [chunkBaseX + CHUNK_SIZE_X - 1, chunkBaseZ],
      [chunkBaseX, chunkBaseZ + CHUNK_SIZE_Z - 1],
      [chunkBaseX + CHUNK_SIZE_X - 1, chunkBaseZ + CHUNK_SIZE_Z - 1],
    ]
    for (const [x, z] of corners) {
      if (isLavaRegion(x, z)) {
        chunkHasLava = true
        break
      }
    }

    // Check adjacent positions for cross-chunk continuity
    if (!chunkHasLava) {
      const adjacentChecks = [
        [chunkBaseX - 1, chunkBaseZ + Math.floor(CHUNK_SIZE_Z / 2)],
        [chunkBaseX + CHUNK_SIZE_X, chunkBaseZ + Math.floor(CHUNK_SIZE_Z / 2)],
        [chunkBaseX + Math.floor(CHUNK_SIZE_X / 2), chunkBaseZ - 1],
        [chunkBaseX + Math.floor(CHUNK_SIZE_X / 2), chunkBaseZ + CHUNK_SIZE_Z],
      ]
      for (const [x, z] of adjacentChecks) {
        if (isLavaRegion(x, z)) {
          chunkHasLava = true
          break
        }
      }
    }

    frameBudget?.startFrame()

    // Iterate over each column in the chunk
    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Get the BASE terrain height (before caves)
        const terrainHeight = getBaseHeightAt(worldX, worldZ)

        // Skip if terrain is at or above lava level
        if (terrainHeight >= lavaLevel) continue

        // Skip if this chunk doesn't have lava
        if (!chunkHasLava) continue

        // Fill from terrain+1 up to lavaLevel
        const fillStartWorldY = terrainHeight + 1
        const fillEndWorldY = lavaLevel

        // Clamp to sub-chunk range
        const clampedStartY = Math.max(fillStartWorldY, subChunkMinY)
        const clampedEndY = Math.min(fillEndWorldY, subChunkMaxY)

        // Skip if no valid Y range in this sub-chunk
        if (clampedStartY > clampedEndY) continue

        // Fill lava blocks in this column
        for (let worldY = clampedStartY; worldY <= clampedEndY; worldY++) {
          const localY = worldY - subChunkMinY

          // Only replace AIR blocks
          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR) {
            chunk.setBlockId(localX, localY, localZ, BlockIds.LAVA)
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
