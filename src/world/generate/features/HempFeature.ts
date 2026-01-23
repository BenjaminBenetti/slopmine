import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for hemp patch generation.
 */
export interface HempFeatureSettings {
  /** Density of hemp patches (lower = rarer). treeDensity for plains is 3.0, use much lower */
  density: number
  /** Minimum hemp plants per patch */
  minPatchSize: number
  /** Maximum hemp plants per patch */
  maxPatchSize: number
  /** Grid size for patch placement (larger = more spread out) */
  gridSize: number
  /** Block to replace ground with when placing hemp (e.g., DIRT for farmland effect) */
  soilBlock?: number
}

/**
 * Hemp feature that places small patches of hemp on grass surfaces.
 * Hemp is placed as stage 1 (seedling) and will grow over time via HempBlockEntity.
 */
export class HempFeature extends Feature {
  readonly settings: HempFeatureSettings

  constructor(settings: HempFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Generate a deterministic random number based on position.
   * Uses a simple hash function for reproducibility.
   */
  private positionRandom(x: number, z: number, salt: number): number {
    // Simple hash combining position and salt
    const hash = Math.sin(x * 12.9898 + z * 78.233 + salt * 43758.5453) * 43758.5453
    return hash - Math.floor(hash)
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, getBaseHeightAt, frameBudget } = context
    const { density, minPatchSize, maxPatchSize, gridSize } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    frameBudget?.startFrame()

    // Check each cell in a grid pattern for potential hemp patch positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        // Use different salt values than wheat to avoid overlapping with wheat patches
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 201) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 202) * gridSize)

        const patchWorldX = worldX + jitterX
        const patchWorldZ = worldZ + jitterZ

        // Probability check for patch placement
        const patchChance = this.positionRandom(patchWorldX, patchWorldZ, 200)
        const threshold = density / (gridSize * gridSize)

        if (patchChance > threshold) continue

        // Get ground height at patch center
        const groundHeight = getBaseHeightAt(patchWorldX, patchWorldZ)
        const hempY = groundHeight + 1 // Place hemp on top of grass

        // Skip if hemp Y is outside this sub-chunk
        if (hempY < subChunkMinY || hempY > subChunkMaxY) continue

        // Determine patch size
        const patchSize = minPatchSize + Math.floor(
          this.positionRandom(patchWorldX, patchWorldZ, 203) * (maxPatchSize - minPatchSize + 1)
        )

        // Place hemp in a small cluster around the patch center
        this.placeHempPatch(
          chunk,
          coord,
          patchWorldX,
          patchWorldZ,
          hempY,
          patchSize,
          subChunkMinY,
          subChunkMaxY,
          getBaseHeightAt
        )
      }
    }

    // Yield after processing
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Place a small patch of hemp around a center point.
   */
  private placeHempPatch(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void; coordinate: { x: bigint; z: bigint } },
    coord: { x: bigint; z: bigint },
    centerWorldX: number,
    centerWorldZ: number,
    centerY: number,
    patchSize: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    let placed = 0

    // Place hemp in a small area around center (roughly circular)
    // Use offsets from -2 to +2 for a small cluster
    const offsets = [
      [0, 0],   // Center
      [1, 0],   // Adjacent
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],   // Diagonal
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]

    // Shuffle offsets deterministically
    const shuffled = [...offsets]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.positionRandom(centerWorldX, centerWorldZ, 300 + i) * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    for (const [dx, dz] of shuffled) {
      if (placed >= patchSize) break

      const worldX = centerWorldX + dx
      const worldZ = centerWorldZ + dz

      // Get height at this position
      const groundHeight = getBaseHeightAt(worldX, worldZ)
      const hempY = groundHeight + 1

      // Skip if outside sub-chunk Y range
      if (hempY < subChunkMinY || hempY > subChunkMaxY) continue

      // Convert to local coordinates (coord.x/z are chunk indices, not world coords)
      const localX = worldX - Number(coord.x) * CHUNK_SIZE_X
      const localZ = worldZ - Number(coord.z) * CHUNK_SIZE_Z

      // Skip if outside chunk bounds
      if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

      const localY = hempY - subChunkMinY

      // Check if ground is grass
      const groundLocalY = groundHeight - subChunkMinY
      if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
        const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
        if (groundBlock !== BlockIds.GRASS) continue
      }

      // Check if placement position is air
      if (localY >= 0 && localY < SUB_CHUNK_HEIGHT) {
        const currentBlock = chunk.getBlockId(localX, localY, localZ)
        if (currentBlock === BlockIds.AIR) {
          // Place hemp
          chunk.setBlockId(localX, localY, localZ, BlockIds.HEMP_1)

          // Replace ground block with soil if configured
          if (this.settings.soilBlock !== undefined && groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
            chunk.setBlockId(localX, groundLocalY, localZ, this.settings.soilBlock)
          }

          placed++
        }
      }
    }
  }
}
