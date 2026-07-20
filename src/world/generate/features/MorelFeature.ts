import { Feature, type FeatureContext } from './Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Configuration for morel mushroom cluster generation.
 */
export interface MorelFeatureSettings {
  /** Density of morel clusters (lower = rarer). treeDensity for plains is 3.0, use much lower */
  density: number
  /** Minimum morels per cluster */
  minClusterSize: number
  /** Maximum morels per cluster */
  maxClusterSize: number
  /** Grid size for cluster placement (larger = more spread out) */
  gridSize: number
}

/**
 * Morel mushroom feature that places small clusters of MOREL_MUSHROOM on the
 * pine-forest floor. Morels grow ONLY on podzol - the needle-litter patches
 * under the pines - so the ground block is strictly checked at placement.
 */
export class MorelFeature extends Feature {
  readonly settings: MorelFeatureSettings

  constructor(settings: MorelFeatureSettings) {
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
    const { density, minClusterSize, maxClusterSize, gridSize } = this.settings
    const coord = chunk.coordinate

    // Determine the sub-chunk's world Y range
    const subChunkCoord = coord as ISubChunkCoordinate
    const subY = typeof subChunkCoord.subY === 'number' ? subChunkCoord.subY : 0
    const subChunkMinY = subY * SUB_CHUNK_HEIGHT
    const subChunkMaxY = subChunkMinY + SUB_CHUNK_HEIGHT - 1

    frameBudget?.startFrame()

    // Check each cell in a grid pattern for potential cluster positions
    for (let localX = 0; localX < CHUNK_SIZE_X; localX += gridSize) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ += gridSize) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Use jittered grid for more natural placement
        const jitterX = Math.floor(this.positionRandom(worldX, worldZ, 1001) * gridSize)
        const jitterZ = Math.floor(this.positionRandom(worldX, worldZ, 1002) * gridSize)

        const clusterWorldX = worldX + jitterX
        const clusterWorldZ = worldZ + jitterZ

        // Probability check for cluster placement
        const clusterChance = this.positionRandom(clusterWorldX, clusterWorldZ, 1000)
        const threshold = density / (gridSize * gridSize)

        if (clusterChance > threshold) continue

        // Get ground height at cluster center
        const groundHeight = getBaseHeightAt(clusterWorldX, clusterWorldZ)
        const morelY = groundHeight + 1 // Place morel on top of the podzol

        // Skip if morel Y is outside this sub-chunk
        if (morelY < subChunkMinY || morelY > subChunkMaxY) continue

        // Determine cluster size
        const clusterSize = minClusterSize + Math.floor(
          this.positionRandom(clusterWorldX, clusterWorldZ, 1003) * (maxClusterSize - minClusterSize + 1)
        )

        // Place morels in a small cluster around the center
        this.placeMorelCluster(
          chunk,
          coord,
          clusterWorldX,
          clusterWorldZ,
          clusterSize,
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
   * Place a small cluster of morels around a center point.
   * Each position is strictly verified to sit on a PODZOL surface block.
   */
  private placeMorelCluster(
    chunk: { getBlockId: (x: number, y: number, z: number) => number; setBlockId: (x: number, y: number, z: number, id: number) => void; coordinate: { x: bigint; z: bigint } },
    coord: { x: bigint; z: bigint },
    centerWorldX: number,
    centerWorldZ: number,
    clusterSize: number,
    subChunkMinY: number,
    subChunkMaxY: number,
    getBaseHeightAt: (worldX: number, worldZ: number) => number
  ): void {
    let placed = 0

    // Place morels in a small area around center (roughly circular)
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
      const j = Math.floor(this.positionRandom(centerWorldX, centerWorldZ, 1100 + i) * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    for (const [dx, dz] of shuffled) {
      if (placed >= clusterSize) break

      const worldX = centerWorldX + dx
      const worldZ = centerWorldZ + dz

      // Get height at this position
      const groundHeight = getBaseHeightAt(worldX, worldZ)
      const morelY = groundHeight + 1

      // Skip if outside sub-chunk Y range
      if (morelY < subChunkMinY || morelY > subChunkMaxY) continue

      // Convert to local coordinates (coord.x/z are chunk indices, not world coords)
      const localX = worldX - Number(coord.x) * CHUNK_SIZE_X
      const localZ = worldZ - Number(coord.z) * CHUNK_SIZE_Z

      // Skip if outside chunk bounds
      if (localX < 0 || localX >= CHUNK_SIZE_X || localZ < 0 || localZ >= CHUNK_SIZE_Z) continue

      const localY = morelY - subChunkMinY

      // Morels grow ONLY on podzol: the ground block must be readable in this
      // sub-chunk AND be PODZOL (unlike lenient features, an unreadable ground
      // block means skip, not place)
      const groundLocalY = groundHeight - subChunkMinY
      if (groundLocalY < 0 || groundLocalY >= SUB_CHUNK_HEIGHT) continue
      const groundBlock = chunk.getBlockId(localX, groundLocalY, localZ)
      if (groundBlock !== BlockIds.PODZOL) continue

      // Check if placement position is air
      if (localY >= 0 && localY < SUB_CHUNK_HEIGHT) {
        const currentBlock = chunk.getBlockId(localX, localY, localZ)
        if (currentBlock === BlockIds.AIR) {
          chunk.setBlockId(localX, localY, localZ, BlockIds.MOREL_MUSHROOM)
          placed++
        }
      }
    }
  }
}
