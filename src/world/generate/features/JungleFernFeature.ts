import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for jungle fern generation.
 */
export interface JungleFernFeatureSettings {
  /** Density of fern patches (higher = more patches) */
  density: number
  /** Grid size for patch placement (larger = more spread out patches) */
  gridSize: number
  /** Minimum ferns per patch */
  minPatchSize: number
  /** Maximum ferns per patch */
  maxPatchSize: number
  /** Radius of each patch in blocks */
  patchRadius: number
  /** Valid ground blocks for fern placement (defaults to [GRASS]) */
  validGroundBlocks?: number[]
}

/**
 * Jungle fern feature that places ferns in dense clumps on grass surfaces.
 * Uses patch-based placement for natural clustering.
 */
export class JungleFernFeature extends Feature {
  readonly settings: JungleFernFeatureSettings

  constructor(settings: JungleFernFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Generate a deterministic random number based on position.
   * Uses a simple hash function for reproducibility.
   */
  private positionRandom(x: number, z: number, salt: number): number {
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, frameBudget, isSurfaceCarvedAt } = context
    const { density, gridSize, minPatchSize, maxPatchSize, patchRadius } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    frameBudget?.startFrame()

    // Check each cell in a grid pattern for potential patch centers
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for patch center
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 801) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 802) * gridSize)

        const patchCenterX = worldX + jitterX
        const patchCenterZ = worldZ + jitterZ

        // Probability check for patch placement
        const patchChance = this.positionRandom(patchCenterX, patchCenterZ, 800)
        const threshold = density / (gridSize * gridSize)

        if (patchChance > threshold) continue

        // Get ground height at patch center
        const centerGroundHeight = getBaseHeightAt(patchCenterX, patchCenterZ)
        const centerFernY = centerGroundHeight + 1

        // Skip if center Y is outside this sub-chunk
        if (centerFernY < subChunkMinY || centerFernY > subChunkMaxY) continue

        // Determine patch size
        const patchSize = minPatchSize + Math.floor(
          this.positionRandom(patchCenterX, patchCenterZ, 803) * (maxPatchSize - minPatchSize + 1)
        )

        // Place ferns in a cluster around the patch center
        this.placeFernPatch(
          chunk,
          coord,
          patchCenterX,
          patchCenterZ,
          patchSize,
          patchRadius,
          subChunkMinY,
          subChunkMaxY,
          getBaseHeightAt,
          isSurfaceCarvedAt
        )
      }
    }

    // Yield after processing
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Place a cluster of ferns around a center point.
   */
  private placeFernPatch(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void; coordinate: { x: bigint; z: bigint } },
    coord: { x: bigint; z: bigint },
    centerWorldX: number,
    centerWorldZ: number,
    patchSize: number,
    patchRadius: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (worldX: number, worldZ: number) => number,
    isSurfaceCarvedAt?: (worldX: number, worldZ: number) => boolean
  ): void {
    let placed = 0

    // Generate offsets within the patch radius
    const offsets: [number, number][] = []
    for (let dx = -patchRadius; dx <= patchRadius; dx++) {
      for (let dz = -patchRadius; dz <= patchRadius; dz++) {
        // Use circular radius check for more natural patches
        if (dx * dx + dz * dz <= patchRadius * patchRadius) {
          offsets.push([dx, dz])
        }
      }
    }

    // Shuffle offsets deterministically for random fill pattern
    for (let i = offsets.length - 1; i > 0; i--) {
      const j = Math.floor(this.positionRandom(centerWorldX, centerWorldZ, 900 + i) * (i + 1))
      ;[offsets[i], offsets[j]] = [offsets[j], offsets[i]]
    }

    const validBlocks = this.settings.validGroundBlocks ?? [BlockIds.GRASS]

    for (const [dx, dz] of offsets) {
      if (placed >= patchSize) break

      const worldX = centerWorldX + dx
      const worldZ = centerWorldZ + dz

      // Skip columns where cave carving opened the surface - the ground-block
      // check below only catches carved columns whose ground Y lands inside
      // this sub-chunk, so this per-fern guard gives full coverage and keeps
      // ferns from floating over cave mouths/ravines.
      if (isSurfaceCarvedAt?.(worldX, worldZ)) continue

      // Get height at this position
      const groundHeight = getBaseHeightAt(worldX, worldZ)
      const fernY = groundHeight + 1

      // Skip if outside sub-chunk Y range
      if (fernY < subChunkMinY || fernY > subChunkMaxY) continue

      // Convert to local coordinates
      const localX = worldX - Number(coord.x) * CHUNK_SIZE_X
      const localZ = worldZ - Number(coord.z) * CHUNK_SIZE_Z

      // Skip if outside chunk bounds
      if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

      const localY = fernY - subChunkMinY

      // Check if ground is valid
      const groundLocalY = groundHeight - subChunkMinY
      if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
        const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
        if (!validBlocks.includes(groundBlock)) continue
      }

      // Check if placement position is air
      if (localY >= 0 && localY < SUB_CHUNK_HEIGHT) {
        const currentBlock = chunk.getBlockId(localX, localY, localZ)
        if (currentBlock === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, BlockIds.JUNGLE_FERN)
          placed++
        }
      }
    }
  }
}
