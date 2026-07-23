import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for basalt column cluster generation.
 */
export interface BasaltColumnsFeatureSettings {
  /** Placement grid size (larger = rarer). */
  gridSize: number
  /** Density multiplier; threshold = density / gridSize². */
  density: number
  /** Block used for the pillars. Default COLUMNAR_BASALT. */
  pillarBlockId?: number
  /**
   * Reject sites whose center surface is below this world Y. Use to keep
   * clusters out of lava-lake valleys (deterministic across slices).
   */
  minSurfaceY?: number
  /**
   * Reject sites whose center surface is above this world Y. Use to keep
   * clusters off crater peaks whose surface blocks worldgen swaps to magma
   * (deterministic across slices).
   */
  maxSurfaceY?: number
  /** Valid ground blocks under the cluster center. Default [BASALT]. */
  validGroundBlocks?: number[]
}

/**
 * Max reach of biome-border dithering (see PineTreeFeature for rationale).
 */
const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/** Half-extent of the cluster footprint (anchor ±4 plus a 2×2 body). */
const HALF = 6
/** Tallest pillar height above the cluster base. */
const MAX_HEIGHT = 8
/** Shortest pillar height. */
const MIN_HEIGHT = 3

/** Terrain probes for the flat-ish ground check (variance <= 2). */
const FLATNESS_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [3, 0], [-3, 0], [0, 3], [0, -3],
  [3, 3], [3, -3], [-3, 3], [-3, -3],
]

/**
 * Pillar anchor offsets in packed order (spiral outward, 2 apart so 2×2
 * pillars tile flush against their neighbours). A cluster takes the first
 * N anchors, so pillars are always adjacent — Giant's Causeway style.
 */
const PILLAR_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [2, 0], [0, 2], [-2, 0], [0, -2],
  [2, 2], [-2, 2], [-2, -2], [2, -2],
  [4, 0], [0, 4], [-4, 0],
]

/**
 * Basalt column clusters: Giant's-Causeway-style groups of vertical basalt
 * pillars (1×1 or 2×2 footprint, heights 3-8 stepping irregularly, 5-12
 * pillars packed adjacent) rising from flat-ish volcanic ground. Deliberately
 * sparse — sprinkled accents, not a landscape takeover.
 *
 * Cross-chunk handling follows PineTreeFeature: world-anchored placement grid
 * and fully deterministic per-pillar parameters derived from the cluster's
 * world origin, with per-chunk XZ clipping and per-sub-chunk Y clipping. All
 * site rules (surface band, flatness, cave mouths, biome borders, ground
 * block) are deterministic so every slice reaches the same verdict.
 */
export class BasaltColumnsFeature extends Feature {
  readonly settings: BasaltColumnsFeatureSettings

  constructor(settings: BasaltColumnsFeatureSettings) {
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
    const { gridSize, density } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    const minSurfaceY = this.settings.minSurfaceY ?? -Infinity
    const maxSurfaceY = this.settings.maxSurfaceY ?? Infinity

    // World-anchored grid (see PineTreeFeature for why chunk-anchored grids
    // desync at chunk borders). Pillars reach HALF blocks from the origin.
    const searchRadius = HALF
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {
        // Deterministic jitter, clamped inward so the cluster stays in cell
        const jitterRange = Math.max(1, gridSize - 2 * HALF)
        const jitterX = HALF + Math.floor(this.positionRandom(worldX, worldZ, 1) * jitterRange)
        const jitterZ = HALF + Math.floor(this.positionRandom(worldX, worldZ, 2) * jitterRange)

        const originX = worldX + jitterX
        const originZ = worldZ + jitterZ

        const chance = this.positionRandom(originX, originZ, 0)
        if (chance > density / (gridSize * gridSize)) continue

        // Not over cave mouths or ravines
        if (context.isSurfaceCarvedAt?.(originX, originZ)) continue

        // Not near foreign-biome regions / the border dither band
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          let nearForeignBiome = false
          for (const [ox, oz] of BIOME_BORDER_PROBES) {
            if (context.getBiomeNameAt(originX + ox, originZ + oz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
        }

        // Flat-ish ground rule: variance <= 2 across the footprint, and the
        // center surface inside the allowed band (above lava lakes, below
        // magma-topped crater peaks)
        const centerHeight = getBaseHeightAt(originX, originZ)
        if (centerHeight < minSurfaceY || centerHeight > maxSurfaceY) continue
        let minH = centerHeight
        let maxH = centerHeight
        for (const [ox, oz] of FLATNESS_PROBES) {
          const h = getBaseHeightAt(originX + ox, originZ + oz)
          if (h < minH) minH = h
          if (h > maxH) maxH = h
        }
        if (maxH - minH > 2) continue

        // Skip if the cluster's vertical span misses this sub-chunk
        if (centerHeight + MAX_HEIGHT < subChunkMinY || minH + 1 > subChunkMaxY) continue

        // Validate ground under the cluster center when this slice can see it
        const localX = originX - chunkWorldX
        const localZ = originZ - chunkWorldZ
        const baseIsAccessible =
          localX >= 0 && localX < CHUNK_SIZE_X &&
          localZ >= 0 && localZ < CHUNK_SIZE_Z &&
          centerHeight >= subChunkMinY && centerHeight <= subChunkMaxY

        if (baseIsAccessible) {
          const validBlocks = this.settings.validGroundBlocks ?? [BlockIds.BASALT]
          const groundLocalY = centerHeight - subChunkMinY
          const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
          if (!validBlocks.includes(groundBlock)) continue
        }

        this.placeCluster(context, originX, originZ, centerHeight, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Place the cluster, clipped to this sub-chunk's Y range and chunk XZ
   * bounds. Every pillar parameter is deterministic from the cluster origin,
   * so all slices render matching pieces.
   */
  private placeCluster(
    context: FeatureContext,
    originX: number,
    originZ: number,
    clusterBaseY: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { chunk, getBaseHeightAt } = context
    const pillarBlockId = this.settings.pillarBlockId ?? BlockIds.COLUMNAR_BASALT

    // 5-12 pillars, taken in packed order so the cluster stays contiguous
    const pillarCount = 5 + Math.floor(this.positionRandom(originX, originZ, 10) * 8)

    for (let i = 0; i < pillarCount && i < PILLAR_ANCHORS.length; i++) {
      const [ax, az] = PILLAR_ANCHORS[i]
      // 1×1 or 2×2 footprint, height 3-8 — irregular steps between neighbours
      const size = this.positionRandom(originX, originZ, 20 + i) < 0.35 ? 2 : 1
      const height = MIN_HEIGHT +
        Math.floor(this.positionRandom(originX, originZ, 40 + i) * (MAX_HEIGHT - MIN_HEIGHT + 1))
      const topY = clusterBaseY + height

      for (let fx = 0; fx < size; fx++) {
        for (let fz = 0; fz < size; fz++) {
          const colWorldX = originX + ax + fx
          const colWorldZ = originZ + az + fz
          const localX = colWorldX - chunkWorldX
          const localZ = colWorldZ - chunkWorldZ
          if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

          // Rise from this column's own ground so pillars root into terrain
          const groundY = getBaseHeightAt(colWorldX, colWorldZ)
          const fromY = Math.max(groundY + 1, subChunkMinY)
          const toY = Math.min(topY, subChunkMaxY)
          for (let worldY = fromY; worldY <= toY; worldY++) {
            const localY = worldY - subChunkMinY
            // Only fill open air — never carve into terrain or other features
            if (chunk.getBlockId(localX, localY, localZ) === BlockIds.AIR) {
              chunk.setBlockId(localX, localY, localZ, pillarBlockId)
            }
          }
        }
      }
    }
  }
}
