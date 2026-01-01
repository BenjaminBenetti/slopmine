import { SimplexNoise } from './SimplexNoise.ts'
import { GenerationConfig } from './GenerationConfig.ts'
import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { WorldManager } from '../WorldManager.ts'
import type { BlockId } from '../interfaces/IBlock.ts'

/**
 * Base class for terrain generators with common utilities.
 */
export abstract class TerrainGenerator {
  protected readonly noise: SimplexNoise
  protected readonly config: GenerationConfig

  constructor(config: GenerationConfig) {
    this.config = config
    this.noise = new SimplexNoise(config.seed)
  }

  /**
   * Get terrain height at world coordinates.
   * Must be implemented by subclasses for biome-specific height variations.
   */
  abstract getHeightAt(worldX: number, worldZ: number): number

  /**
   * Fill a column with layered blocks (stone -> subsurface -> surface).
   */
  protected fillColumn(
    chunk: IChunkData,
    localX: number,
    localZ: number,
    height: number,
    surfaceBlock: BlockId,
    subsurfaceBlock: BlockId,
    subsurfaceDepth: number,
    baseBlock: BlockId
  ): void {
    for (let y = 0; y <= height; y++) {
      let blockId: BlockId

      if (y === height) {
        blockId = surfaceBlock
      } else if (y > height - subsurfaceDepth) {
        blockId = subsurfaceBlock
      } else {
        blockId = baseBlock
      }

      chunk.setBlockId(localX, y, localZ, blockId)
    }
  }

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
