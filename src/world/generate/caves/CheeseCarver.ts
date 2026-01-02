import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/**
 * Generates cheese-style cave chambers using single 3D noise with high threshold.
 * Creates occasional large open areas connected by spaghetti tunnels.
 */
export class CheeseCarver {
  private readonly noise: SimplexNoise

  constructor(seed: number) {
    this.noise = new SimplexNoise(seed)
  }

  /**
   * Carve cheese chambers into the chunk.
   */
  async carve(
    chunk: IChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    frameBudget?: FrameBudget
  ): Promise<void> {
    const { cheeseFrequency, cheeseThreshold, minY, maxY } = settings
    const coord = chunk.coordinate

    frameBudget?.startFrame()

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(coord, { x: localX, y: 0, z: localZ })
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const surfaceY = getHeightAt(worldX, worldZ)
        // Allow caves to reach up to maxY, even if that's at or above surface
        const columnMaxY = Math.min(maxY, surfaceY + 5)

        for (let y = minY; y <= columnMaxY; y++) {
          // Skip if already air
          if (chunk.getBlockId(localX, y, localZ) === BlockIds.AIR) {
            continue
          }

          // Use fractal noise for more interesting chamber shapes
          // Scale Y by 1.5 for chambers with decent height
          const chamberNoise = this.noise.fractalNoise3D(
            worldX * cheeseFrequency,
            y * cheeseFrequency * 1.5,
            worldZ * cheeseFrequency,
            2, // 2 octaves for chambers
            0.5,
            1.0 // scale already applied above
          )

          // Chambers form where noise exceeds threshold
          if (chamberNoise > cheeseThreshold) {
            chunk.setBlockId(localX, y, localZ, BlockIds.AIR)
          }
        }
      }

      // Yield less frequently for cheese caves (faster pass)
      if (frameBudget && localX % 2 === 1) {
        await frameBudget.yieldIfNeeded()
      }
    }
  }

  /**
   * Carve cheese chambers within a sub-chunk's Y range.
   * Uses world coordinates for noise to ensure chambers span sub-chunks correctly.
   */
  async carveSubChunk(
    subChunk: ISubChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): Promise<void> {
    const { cheeseFrequency, cheeseThreshold, minY, maxY } = settings
    const coord = subChunk.coordinate

    // Clamp to both sub-chunk range and cave settings range
    const effectiveMinY = Math.max(minWorldY, minY)
    const effectiveMaxY = Math.min(maxWorldY, maxY)

    if (effectiveMinY > effectiveMaxY) {
      return // No overlap with cave Y range
    }

    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        const worldCoord = localToWorld(
          { x: coord.x, z: coord.z },
          { x: localX, y: 0, z: localZ }
        )
        const worldX = Number(worldCoord.x)
        const worldZ = Number(worldCoord.z)

        const surfaceY = getHeightAt(worldX, worldZ)
        const columnMaxY = Math.min(effectiveMaxY, surfaceY + 5)

        for (let worldY = effectiveMinY; worldY <= columnMaxY; worldY++) {
          const localY = worldY - minWorldY // Convert to sub-chunk local Y

          // Skip if already air
          if (subChunk.getBlockId(localX, localY, localZ) === BlockIds.AIR) {
            continue
          }

          // Use world Y for noise calculation (ensures chambers span sub-chunks)
          const chamberNoise = this.noise.fractalNoise3D(
            worldX * cheeseFrequency,
            worldY * cheeseFrequency * 1.5,
            worldZ * cheeseFrequency,
            2,
            0.5,
            1.0
          )

          if (chamberNoise > cheeseThreshold) {
            subChunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
          }
        }
      }
    }
  }
}
