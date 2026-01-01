import { Feature, type FeatureContext } from './Feature.ts'
import type { BlockId } from '../../interfaces/IBlock.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'

/**
 * Settings for cliff feature generation.
 */
export interface CliffFeatureSettings {
  /** Frequency of cliff noise sampling (lower = larger cliff zones) */
  readonly frequency: number
  /** Noise threshold above which cliffs appear (0-1) */
  readonly threshold: number
  /** Maximum height bonus for cliffs */
  readonly maxHeight: number
  /** Block type used for cliff faces and underground extension */
  readonly block: BlockId
}

/**
 * Cliff feature that creates sudden terrain height jumps with exposed stone faces.
 * Self-scans the chunk and applies modifications where cliff noise exceeds threshold.
 */
export class CliffFeature extends Feature {
  readonly settings: CliffFeatureSettings

  constructor(settings: CliffFeatureSettings) {
    super()
    this.settings = settings
  }

  /**
   * Get the cliff height bonus at a world position.
   */
  private getCliffHeightAt(noise: SimplexNoise, worldX: number, worldZ: number): number {
    const { frequency, threshold, maxHeight } = this.settings
    const cliffNoise = noise.noise2D(worldX * frequency, worldZ * frequency)

    if (cliffNoise > threshold) {
      const cliffIntensity = (cliffNoise - threshold) / (1 - threshold)
      return Math.floor(cliffIntensity * maxHeight)
    }
    return 0
  }

  /**
   * Get effective terrain height at a position including cliff modifications.
   */
  private getEffectiveHeightAt(
    noise: SimplexNoise,
    worldX: number,
    worldZ: number,
    getBaseHeightAt: (x: number, z: number) => number
  ): number {
    return getBaseHeightAt(worldX, worldZ) + this.getCliffHeightAt(noise, worldX, worldZ)
  }

  async scan(context: FeatureContext): Promise<void> {
    const { chunk, noise, biomeProperties, getBaseHeightAt, frameBudget } = context
    const { frequency, threshold, maxHeight, block } = this.settings
    const { surfaceBlock, subsurfaceDepth } = biomeProperties
    const coord = chunk.coordinate

    frameBudget?.startFrame()

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        // Sample cliff noise
        const cliffNoise = noise.noise2D(worldX * frequency, worldZ * frequency)

        if (cliffNoise <= threshold) {
          continue
        }

        // Calculate cliff parameters
        const cliffIntensity = (cliffNoise - threshold) / (1 - threshold)
        const cliffHeight = Math.floor(cliffIntensity * maxHeight)
        const cliffDepth = cliffHeight

        if (cliffHeight === 0) {
          continue
        }

        const baseHeight = getBaseHeightAt(worldX, worldZ)

        // Add cliff height: place blocks above base terrain
        for (let y = baseHeight + 1; y <= baseHeight + cliffHeight; y++) {
          if (y === baseHeight + cliffHeight) {
            // Top of cliff gets surface block
            chunk.setBlockId(localX, y, localZ, surfaceBlock)
          } else {
            // Interior of cliff gets cliff block
            chunk.setBlockId(localX, y, localZ, block)
          }
        }

        // Extend stone underground: replace subsurface blocks with cliff block
        const startDepth = baseHeight
        const endDepth = Math.max(0, baseHeight - subsurfaceDepth - cliffDepth + 1)
        for (let y = startDepth; y >= endDepth; y--) {
          chunk.setBlockId(localX, y, localZ, block)
        }

        // Check neighbors for cliff face exposure
        const currentHeight = baseHeight + cliffHeight
        const neighborHeights = [
          this.getEffectiveHeightAt(noise, worldX - 1, worldZ, getBaseHeightAt),
          this.getEffectiveHeightAt(noise, worldX + 1, worldZ, getBaseHeightAt),
          this.getEffectiveHeightAt(noise, worldX, worldZ - 1, getBaseHeightAt),
          this.getEffectiveHeightAt(noise, worldX, worldZ + 1, getBaseHeightAt),
        ]

        const minNeighborHeight = Math.min(...neighborHeights)
        const cliffExposure = currentHeight - minNeighborHeight

        // Expose cliff block on face where there's a significant height drop
        if (cliffExposure >= 2) {
          const cliffStartDepth = Math.max(0, cliffExposure - 1)
          for (let depth = 1; depth <= cliffStartDepth && depth < subsurfaceDepth; depth++) {
            const y = currentHeight - depth
            if (y >= 0) {
              chunk.setBlockId(localX, y, localZ, block)
            }
          }
        }
      }

      // Yield after each row (only in main thread context)
      if (frameBudget) {
        await frameBudget.yieldIfNeeded()
      }
    }
  }
}
