import { SimplexNoise } from '../SimplexNoise.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'

/**
 * Stateless service that predicts cave locations using noise.
 * Uses the exact same noise calculations as SpaghettiCarver and CheeseCarver,
 * allowing cave prediction without generating chunks.
 */
export class CavePredictionService {
  // Spaghetti cave noise (matches SpaghettiCarver seeds)
  private readonly spaghettiNoise1: SimplexNoise
  private readonly spaghettiNoise2: SimplexNoise
  // Cheese cave noise (matches CheeseCarver seed offset)
  private readonly cheeseNoise: SimplexNoise

  constructor(seed: number) {
    // Must match SpaghettiCarver: seed, seed + 500
    this.spaghettiNoise1 = new SimplexNoise(seed)
    this.spaghettiNoise2 = new SimplexNoise(seed + 500)
    // Must match CheeseCarver via CaveCarver: seed + 1000
    this.cheeseNoise = new SimplexNoise(seed + 1000)
  }

  /**
   * Check if a cave exists at world coordinates WITHOUT generating terrain.
   * Returns true if either spaghetti or cheese cave would form here.
   */
  hasCaveAt(worldX: number, worldY: number, worldZ: number, settings: CaveSettings): boolean {
    // Respect Y bounds
    if (worldY < settings.minY || worldY > settings.maxY) {
      return false
    }

    // Check spaghetti cave
    const spaghettiDensity = this.calculateSpaghettiDensity(
      worldX, worldY, worldZ,
      settings.frequency,
      settings.layerCount,
      settings.layerSpacing,
      settings.layerPeakY
    )
    if (spaghettiDensity < settings.threshold) {
      return true
    }

    // Check cheese cave
    if (settings.cheeseEnabled) {
      const cheeseValue = this.calculateCheeseDensity(
        worldX, worldY, worldZ,
        settings.cheeseFrequency
      )
      if (cheeseValue > settings.cheeseThreshold) {
        return true
      }
    }

    return false
  }

  /**
   * Find the highest cave Y at or below startY at this XZ position.
   * Returns the world Y of the cave, or null if no cave found.
   */
  findCaveBelow(
    worldX: number,
    worldZ: number,
    startY: number,
    settings: CaveSettings
  ): number | null {
    const effectiveStartY = Math.min(startY, settings.maxY)

    for (let y = effectiveStartY; y >= settings.minY; y--) {
      if (this.hasCaveAt(worldX, y, worldZ, settings)) {
        return y
      }
    }
    return null
  }

  /**
   * Verify a cave location has enough volume to be worth an entrance.
   * Checks a cylinder around the target point.
   */
  verifyCaveVolume(
    worldX: number,
    worldY: number,
    worldZ: number,
    settings: CaveSettings,
    radius: number
  ): boolean {
    let caveBlocks = 0
    let totalChecked = 0

    // Check a cylinder of blocks
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz <= radius * radius) {
          totalChecked++
          // Check a few Y levels for better accuracy
          for (let dy = -1; dy <= 1; dy++) {
            if (this.hasCaveAt(worldX + dx, worldY + dy, worldZ + dz, settings)) {
              caveBlocks++
              break // Count this column once
            }
          }
        }
      }
    }

    // Require at least 40% of the footprint to be cave
    return caveBlocks >= totalChecked * 0.4
  }

  /**
   * Calculate spaghetti cave density - mirrors SpaghettiCarver.calculateDensity exactly.
   */
  private calculateSpaghettiDensity(
    x: number,
    y: number,
    z: number,
    frequency: number,
    layerCount: number,
    layerSpacing: number,
    layerPeakY: number
  ): number {
    // Scale Y frequency for horizontal flow (matches SpaghettiCarver)
    const yFreq = frequency * 1.5

    // Primary noise sample
    const n1 = this.spaghettiNoise1.noise3D(x * frequency, y * yFreq, z * frequency)

    // Offset noise sample (offset by 1000 blocks)
    const n2 = this.spaghettiNoise2.noise3D(
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
   * Calculate cheese cave density - mirrors CheeseCarver exactly.
   */
  private calculateCheeseDensity(
    x: number,
    y: number,
    z: number,
    cheeseFrequency: number
  ): number {
    // Fractal noise with 2 octaves (matches CheeseCarver)
    return this.cheeseNoise.fractalNoise3D(
      x * cheeseFrequency,
      y * cheeseFrequency * 1.5,
      z * cheeseFrequency,
      2,    // octaves
      0.5,  // persistence
      1.0   // scale
    )
  }

  /**
   * Calculate layer bonus - mirrors SpaghettiCarver.calculateLayerBonus exactly.
   */
  private calculateLayerBonus(
    y: number,
    layerCount: number,
    layerSpacing: number,
    layerPeakY: number
  ): number {
    let maxBonus = 0

    for (let layer = 0; layer < layerCount; layer++) {
      const layerY = layerPeakY + (layer - Math.floor(layerCount / 2)) * layerSpacing
      const distance = Math.abs(y - layerY)
      const bonus = Math.exp((-distance * distance) / 50) * 0.08
      maxBonus = Math.max(maxBonus, bonus)
    }

    return maxBonus
  }
}
