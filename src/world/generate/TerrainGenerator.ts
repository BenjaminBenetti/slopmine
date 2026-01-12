import { SimplexNoise } from './SimplexNoise.ts'
import type { IGenerationConfig } from './GenerationConfig.ts'
import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { WorldManager } from '../WorldManager.ts'

/**
 * Base class for terrain generators with common utilities.
 */
export abstract class TerrainGenerator {
  protected readonly noise: SimplexNoise
  protected readonly config: IGenerationConfig

  constructor(config: IGenerationConfig) {
    this.config = config
    this.noise = new SimplexNoise(config.seed)
  }

  /**
   * Get terrain height at world coordinates.
   * Must be implemented by subclasses for biome-specific height variations.
   */
  abstract getHeightAt(worldX: number, worldZ: number): number

  /**
   * Deterministic random based on position.
   * Returns a value in [0, 1) that's consistent for the same inputs.
   */
  protected positionRandom(worldX: number, worldZ: number, salt: number = 0): number {
    const seed = this.config.seed
    let hash = seed ^ (worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)
    hash = ((hash ^ (hash >>> 16)) * 0x85ebca6b) >>> 0
    hash = ((hash ^ (hash >>> 13)) * 0xc2b2ae35) >>> 0
    hash = (hash ^ (hash >>> 16)) >>> 0
    return (hash & 0x7fffffff) / 0x7fffffff
  }

  /**
   * Generate terrain for a chunk. Must be implemented by subclasses.
   */
  abstract generate(chunk: IChunkData, world: WorldManager | null): Promise<void>
}
