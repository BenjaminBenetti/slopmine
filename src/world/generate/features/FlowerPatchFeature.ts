import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for flower patch generation.
 */
export interface FlowerPatchFeatureSettings {
  /** Density of flower patches (lower = rarer). treeDensity for plains is 3.0, use much lower */
  density: number
  /** Minimum flowers per patch */
  minPatchSize: number
  /** Maximum flowers per patch */
  maxPatchSize: number
  /** Grid size for patch placement (larger = more spread out) */
  gridSize: number
  /** Array of flower block IDs to randomly select from */
  flowerBlockIds: number[]
  /** Valid ground blocks for flower placement (defaults to [GRASS]) */
  validGroundBlocks?: number[]
}

/**
 * Flower patch feature that places small patches of mixed flowers on grass surfaces.
 * Randomly selects from the configured flower types for visual variety.
 */
export class FlowerPatchFeature extends Feature {
  readonly settings: FlowerPatchFeatureSettings

  constructor(settings: FlowerPatchFeatureSettings) {
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
    const { density, minPatchSize, maxPatchSize, gridSize, flowerBlockIds } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    frameBudget?.startFrame()

    // Check each cell in a grid pattern for potential flower patch positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 501) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 502) * gridSize)

        const patchWorldX = worldX + jitterX
        const patchWorldZ = worldZ + jitterZ

        // Probability check for patch placement
        const patchChance = this.positionRandom(patchWorldX, patchWorldZ, 500)
        const threshold = density / (gridSize * gridSize)

        if (patchChance > threshold) continue

        // Get ground height at patch center
        const groundHeight = getBaseHeightAt(patchWorldX, patchWorldZ)
        const flowerY = groundHeight + 1 // Place flower on top of grass

        // Skip if flower Y is outside this sub-chunk
        if (flowerY < subChunkMinY || flowerY > subChunkMaxY) continue

        // Determine patch size
        const patchSize = minPatchSize + Math.floor(
          this.positionRandom(patchWorldX, patchWorldZ, 503) * (maxPatchSize - minPatchSize + 1)
        )

        // Place flowers in a small cluster around the patch center
        this.placeFlowerPatch(
          chunk,
          coord,
          patchWorldX,
          patchWorldZ,
          flowerY,
          patchSize,
          subChunkMinY,
          subChunkMaxY,
          getBaseHeightAt,
          flowerBlockIds
        )
      }
    }

    // Yield after processing
    if (frameBudget) {
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Place a small patch of flowers around a center point.
   */
  private placeFlowerPatch(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void; coordinate: { x: bigint; z: bigint } },
    coord: { x: bigint; z: bigint },
    centerWorldX: number,
    centerWorldZ: number,
    centerY: number,
    patchSize: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (worldX: number, worldZ: number) => number,
    flowerBlockIds: number[]
  ): void {
    let placed = 0

    // Place flowers in a small area around center (roughly circular)
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
      const j = Math.floor(this.positionRandom(centerWorldX, centerWorldZ, 600 + i) * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    for (const [dx, dz] of shuffled) {
      if (placed >= patchSize) break

      const worldX = centerWorldX + dx
      const worldZ = centerWorldZ + dz

      // Get height at this position
      const groundHeight = getBaseHeightAt(worldX, worldZ)
      const flowerY = groundHeight + 1

      // Skip if outside sub-chunk Y range
      if (flowerY < subChunkMinY || flowerY > subChunkMaxY) continue

      // Convert to local coordinates (coord.x/z are chunk indices, not world coords)
      const localX = worldX - Number(coord.x) * CHUNK_SIZE_X
      const localZ = worldZ - Number(coord.z) * CHUNK_SIZE_Z

      // Skip if outside chunk bounds
      if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

      const localY = flowerY - subChunkMinY

      // Check if ground is a valid block for flower placement
      const groundLocalY = groundHeight - subChunkMinY
      if (groundLocalY >= 0 && groundLocalY < SUB_CHUNK_HEIGHT) {
        const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
        const validBlocks = this.settings.validGroundBlocks ?? [BlockIds.GRASS]
        if (!validBlocks.includes(groundBlock)) continue
      }

      // Check if placement position is air
      if (localY >= 0 && localY < SUB_CHUNK_HEIGHT) {
        const currentBlock = chunk.getBlockId(localX, localY, localZ)
        if (currentBlock === BlockIds.AIR) {
          // Randomly select a flower type from the available options
          const flowerIndex = Math.floor(
            this.positionRandom(worldX, worldZ, 700) * flowerBlockIds.length
          )
          const flowerBlockId = flowerBlockIds[flowerIndex]

          chunk.setBlockId(localX, localY, localZ, flowerBlockId)
          placed++
        }
      }
    }
  }
}
