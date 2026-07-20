import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE
 * in ChunkGenerationWorker). Stumps keep this far from foreign-biome regions
 * so a stump's ground column is never dither-swapped to a foreign block.
 */
const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/**
 * Configuration for pine stump generation.
 */
export interface PineStumpFeatureSettings {
  /** Stump spacing grid size (larger = rarer). */
  gridSize: number
  /** Stump density multiplier; threshold = density / gridSize². */
  density: number
  /** Block ID to place (e.g. BlockIds.PINE_STUMP). */
  blockId: number
  /** Valid ground blocks under a stump (defaults to [GRASS, DIRT, PODZOL]). */
  validGroundBlocks?: number[]
}

/**
 * Pine stump feature: sparse single-block leftover trunk bases scattered
 * across the forest floor, as if old pines were felled long ago.
 *
 * Single-block, so much simpler than the tree features, but the placement
 * grid is still anchored to the WORLD origin with the extended-grid pattern:
 * jitter can push a cell's stump across a chunk border, so neighboring
 * chunks must iterate the same cells and agree (see PineTreeFeature).
 */
export class PineStumpFeature extends Feature {
  readonly settings: PineStumpFeatureSettings

  constructor(settings: PineStumpFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Generate a deterministic random number based on position.
   */
  private positionRandom(x: number, z: number, salt: number): number {
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, biomeProperties } = context
    const { gridSize, density, blockId } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Skip stumps at or below the shoreline (shore columns get sanded by
    // WaterFeature). Deterministic from world coords, so every slice agrees.
    const shoreRadius = biomeProperties.water?.shoreRadius ?? 1
    const minGroundHeight = biomeProperties.water?.enabled
      ? biomeProperties.water.waterLevel + shoreRadius
      : -Infinity

    const validGroundBlocks = this.settings.validGroundBlocks ??
      [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL]

    // World-anchored grid; jitter reaches at most gridSize - 1 blocks, so one
    // extra cell row before the chunk covers all cross-border placements.
    const firstGridX = Math.floor(chunkWorldX / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1
    const firstGridZ = Math.floor(chunkWorldZ / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {
        // Deterministic jitter
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 2) * gridSize)

        const stumpWorldX = worldX + jitterX
        const stumpWorldZ = worldZ + jitterZ

        const localX = stumpWorldX - chunkWorldX
        const localZ = stumpWorldZ - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        const chance = this.positionRandom(stumpWorldX, stumpWorldZ, 0)
        if (chance > density / (gridSize * gridSize)) continue

        // Don't drop stumps over cave mouths or ravines
        if (context.isSurfaceCarvedAt?.(stumpWorldX, stumpWorldZ)) continue

        // Keep stumps out of foreign-biome regions and the border dither band
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          let nearForeignBiome = false
          for (const [ox, oz] of BIOME_BORDER_PROBES) {
            if (context.getBiomeNameAt(stumpWorldX + ox, stumpWorldZ + oz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
        }

        const groundHeight = getBaseHeightAt(stumpWorldX, stumpWorldZ)

        // Skip underwater and shoreline columns (see minGroundHeight above)
        if (groundHeight <= minGroundHeight) continue

        const stumpWorldY = groundHeight + 1
        if (stumpWorldY < subChunkMinY || stumpWorldY > subChunkMaxY) continue

        // Validate ground where checkable (the ground block may live in the
        // sub-chunk below; placement there trusts the deterministic checks)
        const groundLocalY = groundHeight - subChunkMinY
        if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
          const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
          if (!validGroundBlocks.includes(groundBlock)) continue
        }

        const localY = stumpWorldY - subChunkMinY
        if (chunk.getBlockId(localX, localY, localZ) === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, blockId)
        }
      }
    }
  }
}
