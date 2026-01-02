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
    chunk: IChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    frameBudget?: FrameBudget
  ): Promise<void> {
    const { frequency, threshold, minY, maxY, layerCount, layerSpacing, layerPeakY } = settings
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

      // Yield after each row of columns (only if frameBudget provided)
      if (frameBudget) {
        await frameBudget.yieldIfNeeded()
      }
    }
  }

  /**
   * Carve spaghetti tunnels within a sub-chunk's Y range.
   * Uses world coordinates for noise to ensure caves span sub-chunks correctly.
   */
  async carveSubChunk(
    subChunk: ISubChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): Promise<void> {
    const { frequency, threshold, minY, maxY, layerCount, layerSpacing, layerPeakY } = settings
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

          // Use world Y for noise calculation (ensures caves span sub-chunks)
          const density = this.calculateDensity(
            worldX,
            worldY,
            worldZ,
            frequency,
            layerCount,
            layerSpacing,
            layerPeakY
          )

          if (density < threshold) {
            subChunk.setBlockId(localX, localY, localZ, BlockIds.AIR)
          }
        }
      }
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
    // Scale Y frequency for balance between horizontal flow and headroom
    // 1.5 = caves flow horizontally but still have decent height
    const yFreq = frequency * 1.5

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
