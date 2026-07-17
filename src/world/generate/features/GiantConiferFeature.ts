import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for giant conifer (redwood/cedar) generation.
 */
export interface GiantConiferFeatureSettings {
  /** Tree spacing grid size (larger = rarer). */
  gridSize: number
  /** Tree density multiplier; threshold = density / gridSize². */
  density: number
  /** Minimum trunk height. */
  minTrunkHeight: number
  /** Maximum trunk height. */
  maxTrunkHeight: number
  /** Trunk radius at ground level (tapers toward the top). */
  baseTrunkRadius: number
  /** Fraction of trunk height where the canopy begins (e.g. 0.4). */
  canopyStartFraction: number
  /** Widest canopy ring radius. */
  maxCanopyRadius: number
  /** Block ID used for the trunk (e.g. BlockIds.REDWOOD_LOG). */
  logBlockId: number
  /** Block ID used for the foliage (e.g. BlockIds.REDWOOD_LEAVES). */
  leafBlockId: number
  /** Valid ground blocks for tree placement (defaults to [GRASS, DIRT, MOSS]). */
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
const BIOME_BORDER_MARGIN = 16
const BIOME_BORDER_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [BIOME_BORDER_MARGIN, 0], [-BIOME_BORDER_MARGIN, 0],
  [0, BIOME_BORDER_MARGIN], [0, -BIOME_BORDER_MARGIN],
  [BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
  [-BIOME_BORDER_MARGIN, BIOME_BORDER_MARGIN], [-BIOME_BORDER_MARGIN, -BIOME_BORDER_MARGIN],
]

/**
 * Parameters for a specific giant conifer instance.
 */
interface GiantConiferParams {
  trunkHeight: number
  /** Trunk dy where the canopy begins. */
  canopyStartDy: number
}

/**
 * Giant conifer feature: towering coastal-rainforest evergreens with a thick
 * tapered trunk, a flared base, and a tall column of layered foliage rings.
 *
 * Chunk boundaries are handled the MegaTreeFeature way: the placement grid is
 * extended into neighboring chunks and all placement math runs in world
 * coordinates from deterministic per-tree parameters, so every chunk and
 * sub-chunk renders an identical slice of the same tree.
 */
export class GiantConiferFeature extends Feature {
  readonly settings: GiantConiferFeatureSettings

  constructor(settings: GiantConiferFeatureSettings) {
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
  private getTreeParams(treeWorldX: number, treeWorldZ: number): GiantConiferParams {
    const { minTrunkHeight, maxTrunkHeight, canopyStartFraction } = this.settings

    const heightRoll = this.positionRandom(treeWorldX, treeWorldZ, 50)
    const trunkHeight = minTrunkHeight + Math.floor(heightRoll * (maxTrunkHeight - minTrunkHeight + 1))
    const canopyStartDy = Math.max(3, Math.floor(trunkHeight * canopyStartFraction))

    return { trunkHeight, canopyStartDy }
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

  /**
   * Trunk radius at a given height up the trunk: thick flared base tapering
   * quickly to a single-block core.
   */
  private trunkRadiusAt(dy: number, trunkHeight: number): number {
    const { baseTrunkRadius } = this.settings
    const taper = Math.pow(1 - dy / trunkHeight, 1.4)
    return Math.max(1, Math.round(baseTrunkRadius * taper))
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

    // Tallest possible tree: trunk + leaf spire
    const maxTreeHeight = this.settings.maxTrunkHeight + 3
    const minPossibleBaseY = subChunkMinY - maxTreeHeight

    // Canopy rings and the base flare can reach into this chunk from trees
    // rooted in neighbors. The grid is anchored to the WORLD origin (grid
    // lines at global multiples of gridSize), not the chunk origin: a
    // chunk-anchored grid desyncs between neighboring chunks whenever
    // gridSize doesn't divide the chunk size, making each chunk render a
    // different tree set (trunkless canopy fragments at borders). Jitter is
    // non-negative, so cells starting at or below
    // chunkStart - searchRadius - (gridSize - 1) can't reach us.
    const searchRadius = Math.max(this.settings.maxCanopyRadius, this.settings.baseTrunkRadius + 1)
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

        // Skip if tree can't intersect this sub-chunk vertically
        if (treeBaseY < minPossibleBaseY || treeBaseY > subChunkMaxY) continue

        const params = this.getTreeParams(treeWorldX, treeWorldZ)
        const treeTopY = treeBaseY + params.trunkHeight + 2
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
          const validBlocks = this.settings.validGroundBlocks ??
            [BlockIds.GRASS, BlockIds.DIRT, BlockIds.MOSS]

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
   * Place a giant conifer, clipped to this sub-chunk's Y range and chunk XZ bounds.
   */
  private placeTree(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void },
    treeWorldX: number,
    treeWorldZ: number,
    treeBaseY: number,
    params: GiantConiferParams,
    subChunkMinY: number,
    subChunkMaxY: number,
    chunkWorldX: number,
    chunkWorldZ: number
  ): void {
    const { logBlockId, leafBlockId, maxCanopyRadius } = this.settings
    const { trunkHeight, canopyStartDy } = params

    // Tapered trunk with a flared base
    for (let dy = 0; dy < trunkHeight; dy++) {
      const worldY = treeBaseY + dy
      if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

      const localY = worldY - subChunkMinY
      // Extra flare ring at ground level for buttressed redwood roots
      const radiusAtHeight = dy === 0
        ? this.trunkRadiusAt(dy, trunkHeight) + 1
        : this.trunkRadiusAt(dy, trunkHeight)

      for (let dx = -radiusAtHeight; dx <= radiusAtHeight; dx++) {
        for (let dz = -radiusAtHeight; dz <= radiusAtHeight; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz)

          // Slight edge noise keeps the flare from looking stamped
          const edgeNoise = this.positionRandom(treeWorldX + dx, treeWorldZ + dz, 500 + dy) * 0.4
          if (dist > radiusAtHeight + 0.5 - edgeNoise) continue

          const localX = treeWorldX + dx - chunkWorldX
          const localZ = treeWorldZ + dz - chunkWorldZ
          if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

          const currentBlock = chunk.getBlockId(localX, localY, localZ)
          if (currentBlock === BlockIds.AIR || currentBlock === leafBlockId) {
            chunk.setBlockId(localX, localY, localZ, logBlockId)
          }
        }
      }
    }

    // Leaf spire above the trunk top
    const trunkLocalX = treeWorldX - chunkWorldX
    const trunkLocalZ = treeWorldZ - chunkWorldZ
    if (trunkLocalX >= 0 && trunkLocalX < CHUNK_SIZE_X && trunkLocalZ >= 0 && trunkLocalZ < CHUNK_SIZE_Z) {
      for (let dy = 0; dy < 2; dy++) {
        const worldY = treeBaseY + trunkHeight + dy
        if (worldY < subChunkMinY || worldY > subChunkMaxY) continue
        const localY = worldY - subChunkMinY
        if (chunk.getBlockId(trunkLocalX, localY, trunkLocalZ) === BlockIds.AIR) {
          chunk.setBlockId(trunkLocalX, localY, trunkLocalZ, leafBlockId)
        }
      }
    }

    // Layered foliage rings down the upper trunk, with tier bulges every
    // fourth layer for that stacked-branch conifer silhouette
    for (let dy = canopyStartDy; dy < trunkHeight; dy++) {
      const worldY = treeBaseY + dy
      if (worldY < subChunkMinY || worldY > subChunkMaxY) continue

      const localY = worldY - subChunkMinY
      const depthFromTop = trunkHeight - 1 - dy
      let radius = Math.min(maxCanopyRadius, 1 + Math.floor(depthFromTop / 3))
      if (depthFromTop % 4 === 3) {
        radius = Math.min(maxCanopyRadius, radius + 1)
      }

      this.placeLeafRing(chunk, treeWorldX, treeWorldZ, localY, radius, chunkWorldX, chunkWorldZ, depthFromTop)
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
    radius: number,
    chunkWorldX: number,
    chunkWorldZ: number,
    salt: number
  ): void {
    const { leafBlockId } = this.settings

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue

        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > radius + 0.5) continue

        // Thin out the ring edges so the canopy reads feathery, not stamped
        if (dist > radius - 0.5) {
          const sparsity = this.positionRandom(treeWorldX + dx, treeWorldZ + dz, 600 + salt)
          if (sparsity > 0.8) continue
        }

        const localX = treeWorldX + dx - chunkWorldX
        const localZ = treeWorldZ + dz - chunkWorldZ
        if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

        const currentBlock = chunk.getBlockId(localX, localY, localZ)
        if (currentBlock === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, leafBlockId)
        }
      }
    }
  }
}
