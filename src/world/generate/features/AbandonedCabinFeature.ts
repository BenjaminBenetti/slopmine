import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for abandoned cabin generation.
 */
export interface AbandonedCabinFeatureSettings {
  /** Placement grid size (larger = rarer). Cabins are VERY rare (~64). */
  gridSize: number
  /** Density multiplier; threshold = density / gridSize². */
  density: number
  /** Chance a wall plank is missing (ruined look). Default 0.25. */
  wallKnockoutChance?: number
  /** Chance a roof plank is missing (collapsed look). Default 0.45. */
  roofKnockoutChance?: number
  /** Chance a floor plank has rotted to dirt. Default 0.2. */
  floorRotChance?: number
  /** Valid ground blocks under the cabin's center column. */
  validGroundBlocks?: number[]
}

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE
 * in ChunkGenerationWorker). Cabins keep this far from foreign-biome regions
 * so every chunk rendering a slice agrees the cabin exists
 * (see PineTreeFeature for the full rationale).
 */
const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/** Half-extent of the 7x7 footprint (dx, dz in [-HALF, HALF]). */
const HALF = 3
/** Wall height in blocks (dy 1..WALL_HEIGHT above the floor). */
const WALL_HEIGHT = 3
/** Roof layer dy above the floor. */
const ROOF_DY = WALL_HEIGHT + 1
/** How deep the dirt foundation fills hollows below the floor. */
const FOUNDATION_DEPTH = 2

/**
 * Terrain-height probe offsets across the footprint used for the flatness
 * check: center, the four corners, and the four edge midpoints.
 */
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
 * Blocks a wall/roof/furniture block may replace. Surface bumps (the flatness
 * rule allows +-1 of terrain) and tree foliage give way; tree trunks and other
 * structures do not (a trunk through a ruined wall reads fine).
 */
const REPLACEABLE = new Set<number>([
  BlockIds.AIR,
  BlockIds.PINE_NEEDLES,
  BlockIds.GRASS,
  BlockIds.PODZOL,
  BlockIds.SNOWY_GRASS,
  BlockIds.DIRT,
  BlockIds.MOSS,
])

/**
 * Abandoned cabin: a small ruined 7x5x7 pine structure, very rare, found in
 * clearings of the pine forest. Pine log corner posts, plank walls with
 * deterministic gaps knocked out, a doorway, one window, a partially
 * collapsed plank roof, and simple furniture inside (table + chair - NOT a
 * chest: worldgen-placed chests never receive a ChestBlockState, so they
 * would be permanently uninteractable).
 *
 * Cross-chunk handling follows PineTreeFeature: a world-anchored placement
 * grid plus fully deterministic per-block parameters derived from the cabin's
 * world origin, so every chunk/sub-chunk renders an identical slice of the
 * same cabin. All site checks (flatness, shoreline, cave mouths, biome
 * borders, ground block) are deterministic from world coordinates so every
 * slice reaches the same verdict.
 */
export class AbandonedCabinFeature extends Feature {
  readonly settings: AbandonedCabinFeatureSettings

  constructor(settings: AbandonedCabinFeatureSettings) {
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

    // Shore rule (see PineTreeFeature): keep the whole footprint above the
    // sand ring so WaterFeature never swaps our ground out from under a slice.
    const shoreRadius = biomeProperties.water?.shoreRadius ?? 1
    const minGroundHeight = biomeProperties.water?.enabled
      ? biomeProperties.water.waterLevel + shoreRadius
      : -Infinity

    // World-anchored grid (see PineTreeFeature for why chunk-anchored grids
    // desync at chunk borders). The cabin reaches HALF blocks from its origin,
    // so origins up to HALF outside this chunk still touch it.
    const searchRadius = HALF
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {
        // Deterministic jitter. Clamped inward so the cabin footprint stays
        // clear of the next grid cell's territory.
        const jitterRange = Math.max(1, gridSize - 2 * HALF)
        const jitterX = HALF + Math.floor(this.positionRandom(worldX, worldZ, 1) * jitterRange)
        const jitterZ = HALF + Math.floor(this.positionRandom(worldX, worldZ, 2) * jitterRange)

        const originX = worldX + jitterX
        const originZ = worldZ + jitterZ

        const chance = this.positionRandom(originX, originZ, 0)
        if (chance > density / (gridSize * gridSize)) continue

        // No cabins over cave mouths or ravines - probe the footprint, not
        // just the center (deterministic, all slices agree)
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

        // Keep cabins out of foreign-biome regions and the border dither band
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

        // Flat-ground rule: probe base heights across the footprint and
        // require variance <= 1. Also enforces the shore rule on every probe.
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

        const floorY = centerHeight // floor blocks replace the surface layer

        // Skip if the cabin's vertical span misses this sub-chunk entirely
        const structMinY = floorY - FOUNDATION_DEPTH
        const structMaxY = floorY + ROOF_DY
        if (structMaxY < subChunkMinY || structMinY > subChunkMaxY) continue

        // Validate the ground block under the center column when this chunk
        // and sub-chunk can see it (same trust model as PineTreeFeature:
        // slices that cannot check trust the placement).
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

        this.placeCabin(chunk, originX, originZ, floorY, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Decide which block (or AIR sentinel -1 for "leave alone") belongs at a
   * given structure-relative offset. Purely a function of the cabin origin and
   * the offset, so every chunk slice computes identical blocks.
   *
   * Returns the block id to place, BlockIds.AIR to force-clear, or -1 to
   * leave the existing terrain untouched.
   */
  private blockAt(originX: number, originZ: number, dx: number, dy: number, dz: number): number {
    const wallKnockout = this.settings.wallKnockoutChance ?? 0.25
    const roofKnockout = this.settings.roofKnockoutChance ?? 0.45
    const floorRot = this.settings.floorRotChance ?? 0.2

    const bx = originX + dx
    const bz = originZ + dz

    const onPerimeter = Math.abs(dx) === HALF || Math.abs(dz) === HALF
    const isCorner = Math.abs(dx) === HALF && Math.abs(dz) === HALF

    // Floor layer: planks with rotted-out dirt patches
    if (dy === 0) {
      return this.positionRandom(bx, bz, 75) < floorRot ? BlockIds.DIRT : BlockIds.PINE_PLANKS
    }

    // Foundation: handled by caller (fills AIR only)
    if (dy < 0) return BlockIds.DIRT

    // Roof layer: heavily knocked-out planks (collapsed)
    if (dy === ROOF_DY) {
      return this.positionRandom(bx, bz, 70 + dy) < roofKnockout ? -1 : BlockIds.PINE_PLANKS
    }

    // Wall band (dy 1..WALL_HEIGHT)
    if (onPerimeter) {
      // Corner posts: sturdy pine logs, never knocked out
      if (isCorner) return BlockIds.PINE_LOG

      // Doorway: south wall center, two blocks tall - always open
      if (dz === HALF && dx === 0 && (dy === 1 || dy === 2)) return BlockIds.AIR

      // Window: north wall, one block east of center, at head height
      if (dz === -HALF && dx === 1 && dy === 2) return BlockIds.PINE_WINDOW

      // Ruined plank wall: deterministic per-block knockout
      if (this.positionRandom(bx, bz, 70 + dy) < wallKnockout) return BlockIds.AIR
      return BlockIds.PINE_PLANKS
    }

    // Interior furniture (on the floor, away from the doorway)
    if (dy === 1) {
      if (dx === -1 && dz === -1) return BlockIds.PINE_TABLE
      if (dx === 0 && dz === -1) return BlockIds.PINE_CHAIR
      if (dx === 2 && dz === -2) return BlockIds.PINE_SHELF
    }

    // Interior air: clear terrain bumps and stray foliage inside the walls
    if (dy >= 1 && dy < ROOF_DY) return BlockIds.AIR

    return -1
  }

  /**
   * Place the cabin, clipped to this sub-chunk's Y range and chunk XZ bounds.
   * Every block is derived from the origin via blockAt(), so chunks render
   * matching slices of the same structure.
   */
  private placeCabin(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    originX: number,
    originZ: number,
    floorY: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    for (let dx = -HALF; dx <= HALF; dx++) {
      for (let dz = -HALF; dz <= HALF; dz++) {
        const localX = originX + dx - chunkWorldX
        const localZ = originZ + dz - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        for (let dy = -FOUNDATION_DEPTH; dy <= ROOF_DY; dy++) {
          const worldY = floorY + dy
          if (worldY < subChunkMinY || worldY > subChunkMaxY) continue
          const localY = worldY - subChunkMinY

          const target = this.blockAt(originX, originZ, dx, dy, dz)
          if (target === -1) continue

          const current = chunk.getBlockId(localX, localY, localZ)

          if (dy < 0) {
            // Foundation: only fill hollows (never eat existing ground)
            if (current === BlockIds.AIR) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.DIRT)
            }
            continue
          }

          if (dy === 0) {
            // Floor defines the site: always stamp it over the surface
            chunk.setBlockId(localX, localY, localZ, target)
            continue
          }

          if (target === BlockIds.AIR) {
            // Doorway / knockouts / interior clearing: remove replaceable
            // terrain and foliage, leave tree trunks etc. standing
            if (current !== BlockIds.AIR && REPLACEABLE.has(current)) {
              chunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
            }
            continue
          }

          // Structure blocks: only replace terrain surface blocks / foliage
          if (REPLACEABLE.has(current)) {
            chunk.setBlockId(localX, localY, localZ, target)
          }
        }
      }
    }
  }
}
