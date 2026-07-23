import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for charred mining camp generation.
 */
export interface CharredMiningCampFeatureSettings {
  /** Placement grid size (larger = rarer). Camps are VERY rare (~64). */
  gridSize: number
  /** Density multiplier; threshold = density / gridSize². */
  density: number
  /** Chance a shelter wall stub survived the fire. Default 0.45. */
  wallSurvivalChance?: number
  /** Reject sites whose center surface is below this world Y (lava lakes). */
  minSurfaceY?: number
  /** Reject sites whose center surface is above this world Y (magma craters). */
  maxSurfaceY?: number
  /** Valid ground blocks under the camp's center column. Default [BASALT]. */
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

/** Half-extent of the 9×9 camp footprint (elements within [-HALF, HALF]). */
const HALF = 4
/** Highest dy above the camp floor any element reaches (tallest post). */
const MAX_DY = 3

/** Terrain probes for the flat-ish ground check (variance <= 2). */
const FLATNESS_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [HALF, HALF], [HALF, -HALF], [-HALF, HALF], [-HALF, -HALF],
  [HALF, 0], [-HALF, 0], [0, HALF], [0, -HALF],
]

/** Cave-mouth probe offsets (center + corners must all be uncarved). */
const CARVE_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [HALF, HALF], [HALF, -HALF], [-HALF, HALF], [-HALF, -HALF],
]

/**
 * Shelter corner-post positions (a burnt 5×5 frame in the camp's NW quarter).
 */
const POSTS: ReadonlyArray<readonly [number, number]> = [
  [-4, -4], [-4, 0], [0, -4], [0, 0],
]

/** Fallen charred-log debris candidates scattered around the yard. */
const DEBRIS_CANDIDATES: ReadonlyArray<readonly [number, number]> = [
  [1, 3], [-1, 2], [3, 3], [-3, 2], [2, -1],
]

/** Blocks a camp element may replace (volcanic ground has no foliage). */
const REPLACEABLE = new Set<number>([BlockIds.AIR])

/**
 * Charred mining camp: a very rare, burnt-out mining outpost in the volcanic
 * wastes. A ruined 5×5 shelter frame of charred logs (posts burnt to uneven
 * stubs, most walls collapsed), a soot-caked forge and the miners' loot chest
 * inside, a campfire in the yard, fallen charred-log debris, and a small
 * mineable coal/iron cache heaped beside the shelter.
 *
 * The chest is the main reward: worldgen-placed chests get no ChestBlockState
 * at generation, so ChestBlock.prepareInteractionState lazily creates one on
 * first E-interaction and fills a deterministic ore loot table — gated on a
 * CHARRED_LOG within 6 blocks, which the shelter posts (1-3 blocks away)
 * always satisfy. Keep the chest inside that signature radius.
 *
 * Cross-chunk handling follows PineTreeFeature/HuntersCampFeature: a
 * world-anchored placement grid, fully deterministic elements derived from the
 * camp's world origin, per-chunk XZ clipping and per-sub-chunk Y clipping,
 * plus deterministic site rules (surface band, flatness, cave mouths, biome
 * borders via getBiomeNameAt, ground-block validation).
 */
export class CharredMiningCampFeature extends Feature {
  readonly settings: CharredMiningCampFeatureSettings

  constructor(settings: CharredMiningCampFeatureSettings) {
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

        // No camps over cave mouths, fissures, or ravines - probe footprint
        if (context.isSurfaceCarvedAt) {
          let carved = false
          for (const [ox, oz] of CARVE_PROBES) {
            if (context.isSurfaceCarvedAt(originX + ox, originZ + oz)) {
              carved = true
              break
            }
          }
          if (carved) continue
        }

        // Keep camps out of foreign-biome regions and the border dither band
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

        // Flat-ish ground rule (variance <= 2 - volcanic terrain is rough)
        // plus the surface band: above lava-lake valleys, below magma craters
        const centerHeight = getBaseHeightAt(originX, originZ)
        if (centerHeight < minSurfaceY || centerHeight > maxSurfaceY) continue
        let minH = centerHeight
        let maxH = centerHeight
        for (const [ox, oz] of FLATNESS_PROBES) {
          const h = getBaseHeightAt(originX + ox, originZ + oz)
          if (h < minH) minH = h
          if (h > maxH) maxH = h
        }
        // relief <= 4: measured on real volcanic terrain, <=2 passed only 3%
        // of in-band sites (1 camp per ~2000 chunks); <=4 passes ~26%
        if (maxH - minH > 4) continue

        // Camp elements sit one above the origin column's ground
        const campY = centerHeight + 1

        // Skip if the camp's vertical span misses this sub-chunk
        if (campY + MAX_DY < subChunkMinY || campY - 1 > subChunkMaxY) continue

        // Validate ground under the camp center when this slice can see it
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

        this.placeCamp(chunk, originX, originZ, campY, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Compute the camp's element list (offset -> block id), fully deterministic
   * from the origin so every chunk slice agrees.
   */
  private getElements(originX: number, originZ: number): Array<{ dx: number; dy: number; dz: number; blockId: number }> {
    const wallSurvival = this.settings.wallSurvivalChance ?? 0.45
    const elements: Array<{ dx: number; dy: number; dz: number; blockId: number }> = []

    // Burnt shelter frame: corner posts reduced to uneven charred stubs (1-3)
    for (let p = 0; p < POSTS.length; p++) {
      const [px, pz] = POSTS[p]
      const postHeight = 1 + Math.floor(this.positionRandom(originX + px, originZ + pz, 30) * 3)
      for (let dy = 0; dy < postHeight; dy++) {
        elements.push({ dx: px, dy, dz: pz, blockId: BlockIds.CHARRED_LOG })
      }
    }

    // Collapsed wall stubs along the shelter perimeter (ground level only)
    for (let w = -3; w <= -1; w++) {
      // North wall (z = -4) and west wall (x = -4)
      if (this.positionRandom(originX + w, originZ - 4, 31) < wallSurvival) {
        elements.push({ dx: w, dy: 0, dz: -4, blockId: BlockIds.CHARRED_LOG })
      }
      if (this.positionRandom(originX - 4, originZ + w, 32) < wallSurvival) {
        elements.push({ dx: -4, dy: 0, dz: w, blockId: BlockIds.CHARRED_LOG })
      }
      // South wall (z = 0) survived worst - the fire spread from the forge
      if (this.positionRandom(originX + w, originZ, 33) < wallSurvival * 0.5) {
        elements.push({ dx: w, dy: 0, dz: 0, blockId: BlockIds.CHARRED_LOG })
      }
    }

    // The miners' forge, soot-caked but intact, inside the shelter
    elements.push({ dx: -2, dy: 0, dz: -2, blockId: BlockIds.FORGE })

    // The miners' ore chest in the shelter corner - the camp's main reward.
    // Stateless at generation; first E-interaction lazily creates its state
    // and rolls the deterministic ore loot (see ChestBlock/ChestLoot.ts,
    // gated on the shelter's CHARRED_LOG posts within 6 blocks).
    elements.push({ dx: -3, dy: 0, dz: -3, blockId: BlockIds.CHEST })

    // Campfire in the yard, east of the shelter
    elements.push({ dx: 2, dy: 0, dz: 1, blockId: BlockIds.CAMPFIRE })

    // Small mineable supply cache beside the shelter (shrunk now that the
    // chest carries the main loot) - a bit of coal, sometimes iron
    elements.push({ dx: 2, dy: 0, dz: -3, blockId: BlockIds.COAL_BLOCK })
    elements.push({ dx: 3, dy: 0, dz: -3, blockId: BlockIds.IRON_BLOCK })
    if (this.positionRandom(originX, originZ, 34) < 0.5) {
      elements.push({ dx: 3, dy: 0, dz: -2, blockId: BlockIds.COAL_BLOCK })
    }

    // Fallen charred-log debris scattered around the yard
    for (let d = 0; d < DEBRIS_CANDIDATES.length; d++) {
      const [ddx, ddz] = DEBRIS_CANDIDATES[d]
      if (this.positionRandom(originX + ddx, originZ + ddz, 36) < 0.5) {
        elements.push({ dx: ddx, dy: 0, dz: ddz, blockId: BlockIds.CHARRED_LOG })
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

      // Support fill: flatness allows relief up to 4, so columns lower than
      // the origin would leave elements floating - plug the gap with basalt
      if (dy === 0) {
        for (let sy = campY - 4; sy <= campY - 1; sy++) {
          if (sy < subChunkMinY || sy > subChunkMaxY) continue
          const supportLocalY = sy - subChunkMinY
          if (chunk.getBlockId(localX, supportLocalY, localZ) === BlockIds.AIR) {
            chunk.setBlockId(localX, supportLocalY, localZ, BlockIds.BASALT)
          }
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
  }
}
