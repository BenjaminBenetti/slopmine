/**
 * Pure functions for evaluating terrain configurations.
 * This module is shared between main thread and workers.
 */

import type { SimplexNoise } from '../SimplexNoise.ts'
import type { NoiseLayerConfig, TerrainConfig, CombineMode } from './TerrainConfig.ts'

/**
 * Evaluate a single noise layer at a world position.
 * All noise types return values in approximately [-1, 1] range.
 *
 * @param noise - The SimplexNoise instance (seeded)
 * @param layer - Configuration for this noise layer
 * @param x - World X coordinate
 * @param z - World Z coordinate
 * @returns Noise value in [-1, 1] range
 */
export function evaluateNoiseLayer(
  noise: SimplexNoise,
  layer: NoiseLayerConfig,
  x: number,
  z: number
): number {
  switch (layer.type) {
    case 'fractal':
      // Standard fractal Brownian motion - the current default
      return noise.fractalNoise2D(x, z, layer.octaves, layer.persistence, layer.scale)

    case 'ridged': {
      // Ridged noise: absolute value creates sharp ridges
      // Inverted so ridges become peaks
      const raw = noise.fractalNoise2D(x, z, layer.octaves, layer.persistence, layer.scale)
      return 1 - 2 * Math.abs(raw)
    }

    case 'billowed': {
      // Billowed noise: absolute value without inversion
      // Creates soft, puffy shapes like dunes or clouds
      const raw = noise.fractalNoise2D(x, z, layer.octaves, layer.persistence, layer.scale)
      return 2 * Math.abs(raw) - 1
    }

    case 'warped': {
      // Domain warping: offset coordinates by another noise sample
      // Creates organic, twisty, flowing terrain
      const warpStrength = layer.warpStrength ?? 20
      const warpScale = layer.warpScale ?? 0.005
      // Use offset noise samples for X and Z warp
      const warpX = noise.noise2D(x * warpScale, z * warpScale) * warpStrength
      const warpZ = noise.noise2D((x + 1000) * warpScale, (z + 1000) * warpScale) * warpStrength
      return noise.fractalNoise2D(x + warpX, z + warpZ, layer.octaves, layer.persistence, layer.scale)
    }

    default:
      // Fallback to fractal for unknown types
      return noise.fractalNoise2D(x, z, layer.octaves, layer.persistence, layer.scale)
  }
}

/**
 * Combine multiple noise values according to the specified mode.
 *
 * @param values - Array of noise values to combine
 * @param mode - How to combine the values
 * @returns Combined noise value
 */
export function combineNoise(values: number[], mode: CombineMode): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  switch (mode) {
    case 'add':
      return values.reduce((a, b) => a + b, 0)
    case 'multiply':
      return values.reduce((a, b) => a * b, 1)
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
    default:
      return values.reduce((a, b) => a + b, 0)
  }
}

/**
 * Evaluate a complete terrain configuration at a world position.
 * Returns the final height value (not floored).
 *
 * The height formula is: seaLevel + baseHeight + combinedNoise * heightScale
 *
 * @param noise - The SimplexNoise instance (seeded)
 * @param config - Complete terrain configuration
 * @param x - World X coordinate
 * @param z - World Z coordinate
 * @param seaLevel - World sea level
 * @returns Height value (not floored)
 */
export function evaluateTerrainConfig(
  noise: SimplexNoise,
  config: TerrainConfig,
  x: number,
  z: number,
  seaLevel: number
): number {
  // Evaluate all noise layers
  const layerValues = config.layers.map(layer => {
    const noiseValue = evaluateNoiseLayer(noise, layer, x, z)
    return (noiseValue + (layer.offset ?? 0)) * layer.weight
  })

  // Combine all layer values
  const combinedNoise = combineNoise(layerValues, config.combineMode)

  // Apply the height formula: seaLevel + baseHeight + noise * heightScale
  return seaLevel + config.baseHeight + combinedNoise * config.heightScale
}
