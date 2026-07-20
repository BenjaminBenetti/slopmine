import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'
import { SNOW_LINE_Y, SNOW_DUSTING_START_Y, SNOW_DUSTING_FULL_Y } from '../biomes/pineForestConstants.ts'

/**
 * Configuration for pine tree generation.
 */
export interface PineTreeFeatureSettings {
  /** Tree spacing grid size (smaller = denser). */
  gridSize: number
  /** Tree density multiplier; threshold = density / gridSize². */
  density: number
  /** Minimum trunk height. */
  minTrunkHeight: number
  /** Maximum trunk height. */
  maxTrunkHeight: number
  /** Block ID used for the trunk (e.g. BlockIds.PINE_LOG). */
  logBlockId: number
  /** Block ID used for the foliage (e.g. BlockIds.PINE_NEEDLES). */
  leafBlockId: number
  /** Valid ground blocks for tree placement (defaults to [GRASS, DIRT, PODZOL]). */
  validGroundBlocks?: number[]
}

/**
 * Max reach of biome-border dithering (DITHER_DISTANCE_BASE + DITHER_VARIANCE
 * in ChunkGenerationWorker). Trees keep this far from foreign-biome regions:
 * a root in a foreign region would render as trunkless canopy fragments
 * (that biome's chunks never run this feature), and a root inside the dither
 * band can have its surface swapped to a foreign block, making the base
 * slice's ground check disagree with slices that cannot check.
 */
/**
 * Fraction of bottom-canopy-ring leaves that grow a hanging pinecone in the
 * cell directly beneath them. Rolled deterministically per leaf world (x, z)
 * so every chunk/sub-chunk slice agrees.
 */
const PINECONE_CHANCE = 0.1

/** Salt for the pinecone roll (existing salts: 0-2 placement, 40 params). */
const PINECONE_SALT = 60

const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/**
 * Parameters for a specific pine tree instance.
 */
interface PineTreeParams {
  trunkHeight: number
  /** Trunk dy where the canopy cone begins. */
  canopyStartDy: number
  /** Widest canopy ring radius. */
  maxRadius: number
}

/**
 * Pine tree feature that places conical evergreen trees in a worker thread.
 *
 * A pine is a single-block trunk with a cone of foliage: a leaf tip above the
 * trunk top, then rings that widen every two layers going down, leaving the
 * bottom third of the trunk bare.
 *
 * Handles chunk boundaries the same way MegaTreeFeature does: the placement
 * grid is extended into neighboring chunks and all parameters are derived
 * deterministically from the tree's world position, so every chunk/sub-chunk
 * renders its own slice of the same tree.
 */
export class PineTreeFeature extends Feature {
  readonly settings: PineTreeFeatureSettings

  constructor(settings: PineTreeFeatureSettings) {
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

  /**
   * Determine tree parameters based on position (fully deterministic).
   */
  private getTreeParams(treeWorldX: number, treeWorldZ: number): PineTreeParams {
    const { minTrunkHeight, maxTrunkHeight } = this.settings

    const heightRoll = this.positionRandom(treeWorldX, treeWorldZ, 40)
    const trunkHeight = minTrunkHeight + Math.floor(heightRoll * (maxTrunkHeight - minTrunkHeight + 1))

    // Bottom ~third of the trunk stays bare
    const canopyStartDy = Math.max(2, Math.floor(trunkHeight * 0.35))

    // Taller pines get slightly wider cones
    const maxRadius = 2 + Math.floor(trunkHeight / 6)

    return { trunkHeight, canopyStartDy, maxRadius }
  }

  /**
   * Check if a tree should be placed at this position (deterministic).
   */
  private shouldPlaceTree(treeWorldX: number, treeWorldZ: number): boolean {
    const { density, gridSize } = this.settings
    const treeChance = this.positionRandom(treeWorldX, treeWorldZ, 0)
    const threshold = density / (gridSize * gridSize)
    return treeChance <= threshold
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, biomeProperties } = context
    const { gridSize } = this.settings
    const coord = chunk.coordinate

    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    const chunkWorldX = Number(coord.x) * CHUNK_SIZE_X
    const chunkWorldZ = Number(coord.z) * CHUNK_SIZE_Z

    // Skip trees at or below the shoreline. Shore columns get sanded by
    // WaterFeature (and beach fills), which would fail the ground check in the
    // base's own sub-chunk while other chunks/sub-chunks still render their
    // slice of the tree - producing floating canopies. This height rule is
    // deterministic from world coords, so every slice agrees.
    const shoreRadius = biomeProperties.water?.shoreRadius ?? 1
    const minGroundHeight = biomeProperties.water?.enabled
      ? biomeProperties.water.waterLevel + shoreRadius
      : -Infinity

    // Tallest possible tree: trunk + leaf tip
    const maxTreeHeight = this.settings.maxTrunkHeight + 2
    const minPossibleBaseY = subChunkMinY - maxTreeHeight

    // Canopies can reach into this chunk from trees rooted in neighbors.
    // The grid is anchored to the WORLD origin (grid lines at global
    // multiples of gridSize), not the chunk origin: a chunk-anchored grid
    // desyncs between neighboring chunks whenever gridSize doesn't divide the
    // chunk size, making each chunk render a different tree set (trunkless
    // canopy fragments at borders). Jitter is non-negative, so cells starting
    // at or below chunkStart - searchRadius - (gridSize - 1) can't reach us.
    const searchRadius = 2 + Math.floor(this.settings.maxTrunkHeight / 6)
    const firstGridX = Math.floor((chunkWorldX - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridX = chunkWorldX + CHUNK_SIZE_X - 1 + searchRadius
    const firstGridZ = Math.floor((chunkWorldZ - searchRadius) / gridSize) * gridSize - gridSize
    const lastGridZ = chunkWorldZ + CHUNK_SIZE_Z - 1 + searchRadius

    for (let worldX = firstGridX; worldX <= lastGridX; worldX += gridSize) {
      for (let worldZ = firstGridZ; worldZ <= lastGridZ; worldZ += gridSize) {

        // Deterministic jitter
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 2) * gridSize)

        const treeWorldX = worldX + jitterX
        const treeWorldZ = worldZ + jitterZ

        if (!this.shouldPlaceTree(treeWorldX, treeWorldZ)) continue

        // Don't grow trees over cave mouths or ravines (deterministic check,
        // so every sub-chunk slice of the tree agrees)
        if (context.isSurfaceCarvedAt?.(treeWorldX, treeWorldZ)) continue

        // Only grow trees whose whole dither neighborhood is the owning
        // biome (see BIOME_BORDER_PROBES). Deterministic, so all slices agree.
        if (context.getBiomeNameAt) {
          const owner = biomeProperties.name
          let nearForeignBiome = false
          for (const [ox, oz] of BIOME_BORDER_PROBES) {
            if (context.getBiomeNameAt(treeWorldX + ox, treeWorldZ + oz) !== owner) {
              nearForeignBiome = true
              break
            }
          }
          if (nearForeignBiome) continue
        }

        const groundHeight = getBaseHeightAt(treeWorldX, treeWorldZ)
        const treeBaseY = groundHeight + 1

        // Skip underwater and shoreline positions (see minGroundHeight above)
        if (groundHeight <= minGroundHeight) continue

        // Skip if tree base is too far below to reach this sub-chunk
        if (treeBaseY < minPossibleBaseY || treeBaseY > subChunkMaxY) continue

        const params = this.getTreeParams(treeWorldX, treeWorldZ)
        const treeTopY = treeBaseY + params.trunkHeight + 1

        // Skip if tree doesn't intersect this sub-chunk at all
        if (treeTopY < subChunkMinY) continue

        // For trees whose base is inside this chunk and sub-chunk, validate the
        // ground block. Surface blocks come deterministically from fillChunk,
        // so all slices of the tree reach the same verdict wherever they CAN
        // check; slices rendered by other chunks trust the placement. There is
        // deliberately no "base cell is air" check: it would depend on which
        // neighboring trees' leaves happened to land there first, pruning the
        // tree in one sub-chunk while other slices still render it (floating
        // canopies). Placement below only overwrites air/leaves anyway.
        const localX = treeWorldX - chunkWorldX
        const localZ = treeWorldZ - chunkWorldZ
        const baseIsAccessible =
          localX >= 0 && localX < CHUNK_SIZE_X &&
          localZ >= 0 && localZ < CHUNK_SIZE_Z &&
          treeBaseY >= subChunkMinY && treeBaseY <= subChunkMaxY

        if (baseIsAccessible) {
          const validBlocks = [...(this.settings.validGroundBlocks ??
            [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL])]

          // Above the snow line the pine-forest surface is SNOWY_GRASS
          // (see pineForestConstants.ts); accept it as ground there so trees
          // still grow on snow-capped peaks. Height-gated, so this verdict is
          // deterministic across slices like everything else here.
          if (groundHeight >= SNOW_LINE_Y) {
            validBlocks.push(BlockIds.SNOWY_GRASS)
          }

          const groundLocalY = groundHeight - subChunkMinY
          if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
            const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
            if (!validBlocks.includes(groundBlock)) continue
          }
        }

        this.placeTree(chunk, treeWorldX, treeWorldZ, treeBaseY, params, subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ)
      }
    }
  }

  /**
   * Place a pine tree, clipped to this sub-chunk's Y range and chunk XZ bounds.
   */
  private placeTree(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: PineTreeParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { logBlockId, leafBlockId } = this.settings
    const { trunkHeight, canopyStartDy, maxRadius } = params

    // Alpine snow dusting: each pine leaf rolls per-block against a chance
    // that ramps with altitude (0 at SNOW_DUSTING_START_Y -> 1 at
    // SNOW_DUSTING_FULL_Y), so canopies whiten gradually instead of showing
    // a hard horizontal line. Guarded on the configured leaf so other biomes
    // reusing this feature never get snowed; the roll derives only from
    // world coords, so all chunk slices agree.
    const isPine = leafBlockId === BlockIds.PINE_NEEDLES
    const leafIdAt = (worldX: number, worldY: number, worldZ: number): number => {
      if (!isPine || worldY < SNOW_DUSTING_START_Y) return leafBlockId
      const snowChance = (worldY - SNOW_DUSTING_START_Y) / (SNOW_DUSTING_FULL_Y - SNOW_DUSTING_START_Y)
      if (snowChance < 1 && this.positionRandom(worldX + worldY * 131, worldZ - worldY * 57, 73) >= snowChance) {
        return leafBlockId
      }
      return BlockIds.SNOWY_PINE_NEEDLES
    }

    // Blocks this tree's trunk may overwrite: air, its own foliage (either
    // snow variant), and stray pinecones hanging from a neighbor's canopy
    // (skipping those would leave one-block trunk gaps).
    const trunkReplaceable = (blockId: number): boolean =>
      blockId === BlockIds.AIR ||
      blockId === leafBlockId ||
      (isPine && (blockId === BlockIds.SNOWY_PINE_NEEDLES || blockId === BlockIds.PINECONE))

    // Trunk
    const trunkLocalX = treeWorldX - chunkWorldX
    const trunkLocalZ = treeWorldZ - chunkWorldZ
    if (trunkLocalX >= 0 && trunkLocalX < CHUNK_SIZE_X && trunkLocalZ >= 0 && trunkLocalZ < CHUNK_SIZE_Z) {
      for (let dy = 0; dy < trunkHeight; dy++) {
        const worldY = treeBaseY + dy
        if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

        const localY = worldY - subChunkMinY
        const currentBlock = chunk.getBlockId(trunkLocalX, localY, trunkLocalZ)
        if (trunkReplaceable(currentBlock)) {
          chunk.setBlockId(trunkLocalX, localY, trunkLocalZ, logBlockId)
        }
      }

      // Leaf tip directly above the trunk top
      const tipWorldY = treeBaseY + trunkHeight
      if (tipWorldY >= subChunkMinY && tipWorldY <= subChunkMaxY) {
        const tipLocalY = tipWorldY - subChunkMinY
        if (chunk.getBlockId(trunkLocalX, tipLocalY, trunkLocalZ) === BlockIds.AIR) {
          chunk.setBlockId(trunkLocalX, tipLocalY, trunkLocalZ, leafIdAt(treeWorldX, tipWorldY, treeWorldZ))
        }
      }
    }

    // Conical canopy: rings widen every two layers going down the trunk
    for (let dy = canopyStartDy; dy < trunkHeight; dy++) {
      const worldY = treeBaseY + dy
      if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

      const localY = worldY - subChunkMinY
      const depthFromTop = trunkHeight - 1 - dy
      const radius = Math.min(maxRadius, 1 + Math.floor(depthFromTop / 2))

      this.placeLeafRing(chunk, treeWorldX, treeWorldZ, localY, worldY, radius, chunkWorldX, chunkWorldZ, leafIdAt)
    }

    // Hanging pinecones under the bottom canopy ring (pine foliage only)
    if (isPine && canopyStartDy < trunkHeight) {
      const bottomRingWorldY = treeBaseY + canopyStartDy
      const bottomDepthFromTop = trunkHeight - 1 - canopyStartDy
      const bottomRadius = Math.min(maxRadius, 1 + Math.floor(bottomDepthFromTop / 2))
      this.placePinecones(
        chunk, treeWorldX, treeWorldZ, bottomRingWorldY, bottomRadius,
        subChunkMinY, subChunkMaxY, chunkWorldX, chunkWorldZ
      )
    }
  }

  /**
   * Place a circular ring of foliage around the trunk at a given local Y.
   */
  private placeLeafRing(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    localY: number,
    worldY: number,
    radius: number,
    chunkWorldX: number,
    chunkWorldZ: number,
    leafIdAt: (worldX: number, worldY: number, worldZ: number) => number
  ): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue

        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > radius + 0.5) continue

        const localX = treeWorldX + dx - chunkWorldX
        const localZ = treeWorldZ + dz - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        const currentBlock = chunk.getBlockId(localX, localY, localZ)
        if (currentBlock === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, leafIdAt(treeWorldX + dx, worldY, treeWorldZ + dz))
        }
      }
    }
  }

  /**
   * Hang PINECONE blocks in the cell directly below ~PINECONE_CHANCE of the
   * bottom canopy ring's leaves.
   *
   * Determinism across slices: the roll uses positionRandom on the leaf's
   * world (x, z), and the pinecone cell lives in exactly one sub-chunk — only
   * that slice places it, clipped by Y exactly like other placements. When
   * the leaf's own cell is visible in this slice we require it to actually
   * hold the ring's leaf block; when the leaf sits in the sub-chunk above
   * (ring Y just out of range) we trust placement, and the pinecone's
   * scheduled tick self-destructs it at runtime if the leaf turned out to be
   * missing.
   */
  private placePinecones(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    ringWorldY: number,
    radius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const pineconeWorldY = ringWorldY - 1
    if (pineconeWorldY < subChunkMinY || pineconeWorldY > subChunkMaxY) return

    const pineconeLocalY = pineconeWorldY - subChunkMinY
    const leafInRange = ringWorldY >= subChunkMinY && ringWorldY <= subChunkMaxY
    const leafLocalY = ringWorldY - subChunkMinY

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue

        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > radius + 0.5) continue

        const worldX = treeWorldX + dx
        const worldZ = treeWorldZ + dz
        if (this.positionRandom(worldX, worldZ, PINECONE_SALT) >= PINECONE_CHANCE) continue

        const localX = worldX - chunkWorldX
        const localZ = worldZ - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        // Snow dusting makes ring leaves either variant - accept both
        if (leafInRange) {
          const leafId = chunk.getBlockId(localX, leafLocalY, localZ)
          if (leafId !== BlockIds.PINE_NEEDLES && leafId !== BlockIds.SNOWY_PINE_NEEDLES) continue
        }
        if (chunk.getBlockId(localX, pineconeLocalY, localZ) !== BlockIds.AIR) continue

        chunk.setBlockId(localX, pineconeLocalY, localZ, BlockIds.PINECONE)
      }
    }
  }
}
