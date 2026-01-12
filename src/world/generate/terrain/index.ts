/**
 * Terrain configuration module.
 * Provides types and functions for biome-specific terrain generation.
 */

export type {
  NoiseType,
  CombineMode,
  NoiseLayerConfig,
  TerrainConfig,
} from './TerrainConfig.ts'

export { DEFAULT_TERRAIN_CONFIG } from './TerrainConfig.ts'

export {
  evaluateNoiseLayer,
  combineNoise,
  evaluateTerrainConfig,
} from './NoiseEvaluator.ts'
