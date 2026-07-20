import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE
 * in ChunkGenerationWorker). Fallen logs keep this far from foreign-biome
 * regions so every chunk rendering a slice agrees the log run exists.
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
 * Configuration for fallen pine log generation.
 */
export interface FallenPineLogFeatureSettings {
  /** Log spacing grid size (larger = rarer). */
  gridSize: number
  /** Log density multiplier; threshold = density / gridSize². */
  density: number
  /** Minimum run length in blocks. */
  minLength: number
  /** Maximum run length in blocks. */
  maxLength: number
  /** Block ID for X-aligned runs (e.g. BlockIds.FALLEN_PINE_LOG_X). */
  blockIdX: number
  /** Block ID for Z-aligned runs (e.g. BlockIds.FALLEN_PINE_LOG_Z). */
  blockIdZ: number
  /** Valid ground blocks under each log block (defaults to [GRASS, DIRT, PODZOL]). */
  validGroundBlocks?: number[]
}

/**
 * Fallen pine log feature: rare straight runs of 3-6 horizontal log blocks
 * lying on the forest floor, axis-aligned along X or Z.
 *
 * Cross-chunk handling follows PineTreeFeature: the placement grid is
 * anchored to the WORLD origin and extended into neighboring chunks, and all
 * run parameters (axis, length) are derived deterministically from the
 * anchor's world position, so every chunk renders an identical slice of the
 * same run. Each block of the run drapes over the terrain at its own
 * column's surface height + 1, and columns with invalid ground (water,
 * shoreline sand, cave-carved surface) are skipped individually - the
 * ground check for a column only ever happens in the chunk that also places
 * that column's block, so slices always agree.
 */
export class FallenPineLogFeature extends Feature {
  readonly settings: FallenPineLogFeatureSettings

  constructor(settings: FallenPineLogFeatureSettings) {
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
    const { gridSize, density, minLength, maxLength, blockIdX, blockIdZ } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Skip log blocks at or below the shoreline: shore columns get sanded by
    // WaterFeature, and logs floating on water read as bugs. Deterministic
    // from world coords, so every slice agrees.
    const shoreRadius = biomeProperties.water?.shoreRadius ?? 1
    const minGroundHeight = biomeProperties.water?.enabled
      ? biomeProperties.water.waterLevel + shoreRadius
      : -Infinity

    const validGroundBlocks = this.settings.validGroundBlocks ??
      [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL]

    // Runs extend up to maxLength - 1 blocks from their anchor, so anchors in
    // neighboring chunks can reach into this one. World-anchored extended
    // grid (see PineTreeFeature for why chunk-anchored grids desync at
    // chunk borders).
    const searchRadius = maxLength
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {
        // Deterministic jitter
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 2) * gridSize)

        const anchorWorldX = worldX + jitterX
        const anchorWorldZ = worldZ + jitterZ

        const chance = this.positionRandom(anchorWorldX, anchorWorldZ, 0)
        if (chance > density / (gridSize * gridSize)) continue

        // Only place runs whose whole dither neighborhood is the owning
        // biome (see BIOME_BORDER_PROBES). Deterministic, so all slices agree.
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          let nearForeignBiome = false
          for (const [ox, oz] of BIOME_BORDER_PROBES) {
            if (context.getBiomeNameAt(anchorWorldX + ox, anchorWorldZ + oz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
        }

        // Run parameters, fully deterministic from the anchor position
        const alongX = this.positionRandom(anchorWorldX, anchorWorldZ, 70) < 0.5
        const lengthRoll = this.positionRandom(anchorWorldX, anchorWorldZ, 71)
        const runLength = minLength + Math.floor(lengthRoll * (maxLength - minLength + 1))
        const logBlockId = alongX ? blockIdX : blockIdZ

        // Place each block of the run on its own column's surface
        for (let i = 0; i < runLength; i++) {
          const blockWorldX = anchorWorldX + (alongX ? i : 0)
          const blockWorldZ = anchorWorldZ + (alongX ? 0 : i)

          const localX = blockWorldX - chunkWorldX
          const localZ = blockWorldZ - chunkWorldZ
          if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

          // Skip individual blocks over cave mouths and ravines
          if (context.isSurfaceCarvedAt?.(blockWorldX, blockWorldZ)) continue

          const groundHeight = getBaseHeightAt(blockWorldX, blockWorldZ)

          // Skip underwater and shoreline columns (see minGroundHeight above)
          if (groundHeight <= minGroundHeight) continue

          const blockWorldY = groundHeight + 1
          if (blockWorldY < subChunkMinY || blockWorldY > subChunkMaxY) continue

          // Validate ground where checkable (the ground block may live in the
          // sub-chunk below; placement there trusts the deterministic checks)
          const groundLocalY = groundHeight - subChunkMinY
          if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
            const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
            if (!validGroundBlocks.includes(groundBlock)) continue
          }

          const localY = blockWorldY - subChunkMinY
          if (chunk.getBlockId(localX, localY, localZ) === BlockIds.AIR) {
            chunk.setBlockId(localX, localY, localZ, logBlockId)
          }
        }
      }
    }
  }
}
