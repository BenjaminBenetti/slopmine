import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for hunter's camp generation.
 */
export interface HuntersCampFeatureSettings {
  /** Placement grid size (larger = rarer). Camps are rare (~48). */
  gridSize: number
  /** Density multiplier; threshold = density / gridSize². */
  density: number
  /** Chance the camp includes a small lean-to shelter. Default 0.6. */
  leanToChance?: number
  /** Valid ground blocks under the campfire column. */
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

/** Half-extent of the camp footprint (elements within [-HALF, HALF]). */
const HALF = 3
/** Highest dy above the camp floor any element reaches (smoke gap top). */
const MAX_DY = 8

/** Terrain probes for the flatness check (center + near ring). */
const FLATNESS_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [2, 0], [-2, 0], [0, 2], [0, -2],
  [2, 2], [2, -2], [-2, 2], [-2, -2],
]

/**
 * Log-seat candidate offsets around the fire. Deliberately keeps the west
 * side (x <= -2) clear - that's where the lean-to goes.
 */
const SEAT_CANDIDATES: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [0, 2], [2, -2], [-1, 2], [1, -2],
]

/** Blocks a camp element may replace (terrain surface bumps + foliage). */
const REPLACEABLE = new Set<number>([
  BlockIds.AIR,
  BlockIds.PINE_NEEDLES,
  BlockIds.GRASS,
  BlockIds.PODZOL,
  BlockIds.SNOWY_GRASS,
  BlockIds.MOSS,
])

/**
 * Hunter's camp: a tiny abandoned campsite - a stone-ringed campfire in the
 * middle, two or three pine log seats around it, and (usually) a small
 * plank-and-slab lean-to on the west side. A short "smoke gap" of cleared
 * foliage rises above the fire so camps under the pine canopy read correctly.
 *
 * Cross-chunk handling follows PineTreeFeature: world-anchored placement
 * grid, every parameter derived deterministically from the camp's world
 * origin, per-chunk XZ clipping and per-sub-chunk Y clipping, plus the
 * standard deterministic site rules (flatness, shoreline, cave mouths,
 * biome-border probes, ground-block validation).
 *
 * The lean-to uses pine slabs rather than stairs: worldgen cannot write
 * block metadata, and stairs orient via metadata.
 */
export class HuntersCampFeature extends Feature {
  readonly settings: HuntersCampFeatureSettings

  constructor(settings: HuntersCampFeatureSettings) {
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

    // Shore rule (see PineTreeFeature)
    const shoreRadius = biomeProperties.water?.shoreRadius ?? 1
    const minGroundHeight = biomeProperties.water?.enabled
      ? biomeProperties.water.waterLevel + shoreRadius
      : -Infinity

    // World-anchored grid (see PineTreeFeature for why)
    const searchRadius = HALF
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {
        // Deterministic jitter, clamped inward so the footprint stays in cell
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

        // Flat-ground rule: variance <= 1 across the footprint, above shore
        const centerHeight = getBaseHeightAt(originX, originZ)
        let minH = centerHeight
        let maxH = centerHeight
        for (const [ox, oz] of FLATNESS_PROBES) {
          const h = getBaseHeightAt(originX + ox, originZ + oz)
          if (h < minH) minH = h
          if (h > maxH) maxH = h
        }
        if (maxH - minH > 1) continue
        if (minH <= minGroundHeight) continue

        // Camp elements sit one above the origin column's ground
        const campY = centerHeight + 1

        // Skip if the camp's vertical span misses this sub-chunk
        if (campY + MAX_DY < subChunkMinY || campY - 1 > subChunkMaxY) continue

        // Validate ground under the campfire when this slice can see it
        const localX = originX - chunkWorldX
        const localZ = originZ - chunkWorldZ
        const baseIsAccessible =
          localX >= 0 && localX < CHUNK_SIZE_X &&
          localZ >= 0 && localZ < CHUNK_SIZE_Z &&
          centerHeight >= subChunkMinY && centerHeight <= subChunkMaxY

        if (baseIsAccessible) {
          const validBlocks = this.settings.validGroundBlocks ??
            [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL, BlockIds.SNOWY_GRASS]
          const groundLocalY = centerHeight - subChunkMinY
          const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
          if (!validBlocks.includes(groundBlock)) continue
        }

        this.placeCamp(chunk, originX, originZ, campY, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Compute the camp's element list (offset -> block id), fully deterministic
   * from the origin so every chunk slice agrees.
   */
  private getElements(originX: number, originZ: number): Array<{ dx: number; dy: number; dz: number; blockId: number }> {
    const leanToChance = this.settings.leanToChance ?? 0.6
    const elements: Array<{ dx: number; dy: number; dz: number; blockId: number }> = []

    // Campfire in the middle
    elements.push({ dx: 0, dy: 0, dz: 0, blockId: BlockIds.CAMPFIRE })

    // 2-3 log seats, rotating through the candidate ring per-camp
    const seatCount = 2 + (this.positionRandom(originX, originZ, 80) < 0.5 ? 1 : 0)
    const startIdx = Math.floor(this.positionRandom(originX, originZ, 81) * SEAT_CANDIDATES.length)
    for (let i = 0; i < seatCount; i++) {
      const [sx, sz] = SEAT_CANDIDATES[(startIdx + i) % SEAT_CANDIDATES.length]
      elements.push({ dx: sx, dy: 0, dz: sz, blockId: BlockIds.PINE_LOG })
    }

    // Optional lean-to on the west side: two log posts, sloped slab roof
    if (this.positionRandom(originX, originZ, 82) < leanToChance) {
      for (const pz of [-1, 1]) {
        elements.push({ dx: -3, dy: 0, dz: pz, blockId: BlockIds.PINE_LOG })
        elements.push({ dx: -3, dy: 1, dz: pz, blockId: BlockIds.PINE_PLANKS })
      }
      for (let rz = -1; rz <= 1; rz++) {
        elements.push({ dx: -3, dy: 2, dz: rz, blockId: BlockIds.PINE_SLAB })
        elements.push({ dx: -2, dy: 1, dz: rz, blockId: BlockIds.PINE_SLAB })
      }
    }

    return elements
  }

  /**
   * Place the camp, clipped to this sub-chunk's Y range and chunk XZ bounds.
   */
  private placeCamp(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    originX: number,
    originZ: number,
    campY: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const elements = this.getElements(originX, originZ)

    for (const { dx, dy, dz, blockId } of elements) {
      const localX = originX + dx - chunkWorldX
      const localZ = originZ + dz - chunkWorldZ
      if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

      // Support fill: flatness allows +-1 of terrain, so a column one block
      // lower than the origin would leave the element floating - plug the gap
      const supportY = campY + dy - 1
      if (supportY >= subChunkMinY && supportY <= subChunkMaxY && dy === 0) {
        const supportLocalY = supportY - subChunkMinY
        if (chunk.getBlockId(localX, supportLocalY, localZ) === BlockIds.AIR) {
          chunk.setBlockId(localX, supportLocalY, localZ, BlockIds.DIRT)
        }
      }

      const worldY = campY + dy
      if (worldY < subChunkMinY || worldY > subChunkMaxY) continue
      const localY = worldY - subChunkMinY

      const current = chunk.getBlockId(localX, localY, localZ)
      if (REPLACEABLE.has(current)) {
        chunk.setBlockId(localX, localY, localZ, blockId)
      }
    }

    // Smoke gap: clear foliage in a short column above the fire so the camp
    // reads under the dense pine canopy (trunks are left standing)
    const gapLocalX = originX - chunkWorldX
    const gapLocalZ = originZ - chunkWorldZ
    if (gapLocalX >= 0 && gapLocalX < CHUNK_SIZE_X && gapLocalZ >= 0 && gapLocalZ < CHUNK_SIZE_Z) {
      for (let dy = 1; dy <= MAX_DY; dy++) {
        const worldY = campY + dy
        if (worldY < subChunkMinY || worldY > subChunkMaxY) continue
        const localY = worldY - subChunkMinY
        if (chunk.getBlockId(gapLocalX, localY, gapLocalZ) === BlockIds.PINE_NEEDLES) {
          chunk.setBlockId(gapLocalX, localY, gapLocalZ, BlockIds.AIR)
        }
      }
    }
  }
}
