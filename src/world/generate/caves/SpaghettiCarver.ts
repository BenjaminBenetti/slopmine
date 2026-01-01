import type { Chunk } from '../../chunks/Chunk.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import { SimplexNoise } from '../SimplexNoise.ts'
import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import { localToWorld } from '../../coordinates/CoordinateUtils.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/**
 * Generates spaghetti-style cave tunnels using dual 3D noise.
 * When two offset noise samples are both near zero, a tunnel forms.
 */
export class SpaghettiCarver {
  private readonly noise1: SimplexNoise
  private readonly noise2: SimplexNoise

  constructor(seed: number) {
    this.noise1 = new SimplexNoise(seed)
    this.noise2 = new SimplexNoise(seed + 500)
  }

  /**
   * Carve spaghetti tunnels into the chunk.
   */
  async carve(
    chunk: Chunk,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    frameBudget: FrameBudget
  ): Promise<void> {
    const { frequency, threshold, minY, maxY, layerCount, layerSpacing, layerPeakY } = settings
    const coord = chunk.coordinate

    frameBudget.startFrame()

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

          const density = this.calculateDensity(
            worldX,
            y,
            worldZ,
            frequency,
            layerCount,
            layerSpacing,
            layerPeakY
          )

          if (density < threshold) {
            chunk.setBlockId(localX, y, localZ, BlockIds.AIR)
          }
        }
      }

      // Yield after each row of columns
      await frameBudget.yieldIfNeeded()
    }
  }

  /**
   * Calculate cave density using dual noise multiplication.
   * Caves form where both noise values are near zero.
   */
  private calculateDensity(
    x: number,
    y: number,
    z: number,
    frequency: number,
    layerCount: number,
    layerSpacing: number,
    layerPeakY: number
  ): number {
    // Scale Y frequency higher for horizontal tunnels (less steep)
    // Higher Y freq = noise changes faster in Y = caves are thin vertically
    const yFreq = frequency * 3.0

    // Primary noise sample
    const n1 = this.noise1.noise3D(x * frequency, y * yFreq, z * frequency)

    // Offset noise sample (offset by 1000 blocks)
    const n2 = this.noise2.noise3D(
      (x + 1000) * frequency,
      (y + 1000) * yFreq,
      (z + 1000) * frequency
    )

    // Squared sum creates tubes where both are near zero
    const baseDensity = n1 * n1 + n2 * n2

    // Layer bonus increases cave probability at specific heights
    const layerBonus = this.calculateLayerBonus(y, layerCount, layerSpacing, layerPeakY)

    return baseDensity - layerBonus
  }

  /**
   * Calculate layer bonus for multi-level caves.
   * Creates density reduction at specific Y levels.
   */
  private calculateLayerBonus(
    y: number,
    layerCount: number,
    layerSpacing: number,
    layerPeakY: number
  ): number {
    let maxBonus = 0

    for (let layer = 0; layer < layerCount; layer++) {
      // Distribute layers around the peak Y
      const layerY = layerPeakY + (layer - Math.floor(layerCount / 2)) * layerSpacing
      const distance = Math.abs(y - layerY)

      // Gaussian-like falloff from layer center
      const bonus = Math.exp((-distance * distance) / 50) * 0.08

      maxBonus = Math.max(maxBonus, bonus)
    }

    return maxBonus
  }
}
