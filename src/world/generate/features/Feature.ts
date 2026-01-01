import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { WorldManager } from '../../WorldManager.ts'
import type { SimplexNoise } from '../SimplexNoise.ts'
import type { IGenerationConfig } from '../GenerationConfig.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import type { BiomeProperties } from '../BiomeGenerator.ts'

/**
 * Context provided to features during chunk generation.
 */
export interface FeatureContext {
  /** The chunk being generated */
  readonly chunk: IChunkData
  /** World manager for reading adjacent chunks (null in worker context) */
  readonly world: WorldManager | null
  /** Noise generator seeded for this world */
  readonly noise: SimplexNoise
  /** World generation configuration */
  readonly config: IGenerationConfig
  /** Biome properties for the current biome */
  readonly biomeProperties: BiomeProperties
  /** Get base terrain height at world coordinates (before features) */
  readonly getBaseHeightAt: (worldX: number, worldZ: number) => number
  /** Frame budget for yielding to prevent blocking (optional in worker) */
  readonly frameBudget?: FrameBudget
}

/**
 * Abstract base class for terrain features.
 * Features scan chunks and apply modifications after base terrain generation.
 */
export abstract class Feature {
  /**
   * Scan the chunk and apply the feature where appropriate.
   * Features are responsible for their own iteration and placement logic.
   * Can access adjacent chunks via context.world for handling chunk borders.
   */
  abstract scan(context: FeatureContext): Promise<void>
}
