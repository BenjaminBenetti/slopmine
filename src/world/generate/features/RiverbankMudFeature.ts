import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Settings for riverbank mud feature.
 */
export interface RiverbankMudFeatureSettings {
  /** Water level Y coordinate */
  readonly waterLevel: number
  /** Maximum height above water to place mud (thin strip) */
  readonly maxHeightAboveWater: number
  /** Maximum depth below surface to place mud */
  readonly maxDepthBelowSurface: number
  /** Large-scale noise frequency for mud zones */
  readonly zoneFrequency: number
  /** Fine-scale noise frequency for patchy placement */
  readonly patchFrequency: number
  /** Noise threshold for placement (lower = more coverage) */
  readonly threshold: number
}

/**
 * Riverbank mud feature that places patchy mud blocks along water edges.
 * Uses dual-layer noise for organic, patchy placement instead of solid bands.
 * Extends below the surface for natural-looking deposits.
 */
export class RiverbankMudFeature extends Feature {
  readonly settings: RiverbankMudFeatureSettings

  constructor(settings: RiverbankMudFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, noise } = context
    const { waterLevel, maxHeightAboveWater, maxDepthBelowSurface, zoneFrequency, patchFrequency, threshold } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    // Calculate the full Y range we might affect (surface + depth)
    const potentialMinY = waterLevel - maxDepthBelowSurface
    const potentialMaxY = waterLevel + maxHeightAboveWater + 10 // Buffer for terrain variation

    // Skip if our potential range is entirely outside this sub-chunk
    if (potentialMaxY < subChunkMinY || potentialMinY > subChunkMaxY) return

    // Scan each column
    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Check if there's water nearby at this column
        const waterLocalY = waterLevel - subChunkMinY
        if (waterLocalY >= 0 && waterLocalY < SUB_CHUNK_HEIGHT) {
          const blockAtWaterLevel = chunk.getBlockId(localX, waterLocalY, localZ)
          // If this column has water, skip - we only want the banks
          if (blockAtWaterLevel === BlockIds.WATER) continue
        }

        // Check adjacent columns for water to determine if we're at a riverbank
        const isNearWater = this.hasAdjacentWater(chunk, localX, localZ, waterLevel, subChunkMinY)
        if (!isNearWater) continue

        // Dual-layer noise for patchy placement
        const zoneNoise = noise.noise2D(worldX * zoneFrequency, worldZ * zoneFrequency)
        const patchNoise = noise.noise2D(worldX * patchFrequency, worldZ * patchFrequency)
        const combinedNoise = (zoneNoise + 1) * 0.5 * (patchNoise + 1) * 0.5

        if (combinedNoise < threshold) continue

        // Find the surface level in this column (highest solid block near water level)
        let surfaceY = -1
        const searchStartY = Math.min(waterLevel + maxHeightAboveWater + 5, subChunkMaxY)
        const searchEndY = Math.max(waterLevel - 5, subChunkMinY)

        for (let worldY = searchStartY; worldY >= searchEndY; worldY--) {
          const localY = worldY - subChunkMinY
          if (localY < 0 || localY >= SUB_CHUNK_HEIGHT) continue

          const block = chunk.getBlockId(localX, localY, localZ)
          if (block === BlockIds.GRASS || block === BlockIds.DIRT || block === BlockIds.STONE) {
            surfaceY = worldY
            break
          }
        }

        if (surfaceY === -1) continue

        // Only affect blocks near water level
        if (surfaceY > waterLevel + maxHeightAboveWater) continue

        // Place mud from surface down to maxDepthBelowSurface
        const startY = surfaceY
        const endY = Math.max(surfaceY - maxDepthBelowSurface, subChunkMinY)

        for (let worldY = startY; worldY >= endY; worldY--) {
          const localY = worldY - subChunkMinY
          if (localY < 0 || localY >= SUB_CHUNK_HEIGHT) continue

          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          const depthFromSurface = surfaceY - worldY

          // Replace grass, dirt, or stone with mud
          if (currentBlock === BlockIds.GRASS || currentBlock === BlockIds.DIRT || currentBlock === BlockIds.STONE) {
            // Reduce chance as depth increases
            const depthFactor = 1.0 - (depthFromSurface / (maxDepthBelowSurface + 1)) * 0.3

            const hash = this.positionHash(worldX, worldY, worldZ)
            if (hash < depthFactor) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.MUD)
            }
          }
        }
      }
    }
  }

  /**
   * Check if any adjacent column has water at the water level.
   */
  private hasAdjacentWater(
    chunk: any,
    localX: number,
    localZ: number,
    waterLevel: number,
    subChunkMinY: number
  ): boolean {
    const waterLocalY = waterLevel - subChunkMinY
    if (waterLocalY < 0 || waterLocalY >= SUB_CHUNK_HEIGHT) return false

    const offsets = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1],
      [-2, 0], [2, 0], [0, -2], [0, 2],
    ]

    for (const [dx, dz] of offsets) {
      const nx = localX + dx
      const nz = localZ + dz

      if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) continue

      const neighborBlock = chunk.getBlockId(nx, waterLocalY, nz)
      if (neighborBlock === BlockIds.WATER) {
        return true
      }
    }

    return false
  }

  /**
   * Deterministic hash based on position for consistent randomness.
   */
  private positionHash(x: number, y: number, z: number): number {
    const n = Math.sin(x * 12.9898 + y * 4.1414 + z * 78.233) * 43758.5453
    return n - Math.floor(n)
  }
}
