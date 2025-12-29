// Noise
export { SimplexNoise } from './SimplexNoise.ts'

// Configuration
export {
  GenerationConfig,
  type IGenerationConfig,
  type BiomeType,
} from './GenerationConfig.ts'

// Base classes
export { TerrainGenerator } from './TerrainGenerator.ts'
export { BiomeGenerator, type BiomeProperties } from './BiomeGenerator.ts'

// Biomes
export { PlainsGenerator } from './biomes/PlainsGenerator.ts'
export { GrassyHillsGenerator } from './biomes/GrassyHillsGenerator.ts'

// Structures
export { OakTree, type TreeParams } from './structures/OakTree.ts'

// Main coordinator
export { WorldGenerator } from './WorldGenerator.ts'
