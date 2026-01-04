import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import { SpaghettiCarver } from './SpaghettiCarver.ts'
import { CheeseCarver } from './CheeseCarver.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/**
 * Main orchestrator for cave generation.
 * Coordinates spaghetti tunnels and cheese chambers.
 * Note: Entrance generation is handled separately by EntranceGenerator in WorldGenerator.
 */
export class CaveCarver {
  private readonly spaghettiCarver: SpaghettiCarver
  private readonly cheeseCarver: CheeseCarver

  constructor(seed: number) {
    this.spaghettiCarver = new SpaghettiCarver(seed)
    this.cheeseCarver = new CheeseCarver(seed + 1000)
  }

  /**
   * Carve caves into the chunk terrain.
   */
  async carve(
    chunk: IChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    frameBudget?: FrameBudget
  ): Promise<void> {
    // First pass: carve spaghetti tunnels
    await this.spaghettiCarver.carve(chunk, settings, getHeightAt, frameBudget)

    // Second pass: carve cheese chambers
    if (settings.cheeseEnabled) {
      await this.cheeseCarver.carve(chunk, settings, getHeightAt, frameBudget)
    }

    // Note: Entrance generation is handled separately by WorldGenerator
    // using noise-based prediction (EntranceGenerator)
  }

  /**
   * Carve caves within a sub-chunk's Y range.
   * Only carves blocks within [minWorldY, maxWorldY].
   */
  async carveSubChunk(
    subChunk: ISubChunkData,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    minWorldY: number,
    maxWorldY: number
  ): Promise<void> {
    // Clamp cave generation to effective range
    const effectiveMinY = Math.max(minWorldY, settings.minY)
    const effectiveMaxY = Math.min(maxWorldY, settings.maxY)

    if (effectiveMinY > effectiveMaxY) {
      // Sub-chunk is outside cave Y range
      return
    }

    // First pass: carve spaghetti tunnels
    await this.spaghettiCarver.carveSubChunk(subChunk, settings, getHeightAt, minWorldY, maxWorldY)

    // Second pass: carve cheese chambers
    if (settings.cheeseEnabled) {
      await this.cheeseCarver.carveSubChunk(subChunk, settings, getHeightAt, minWorldY, maxWorldY)
    }

    // Note: Entrance generation is skipped for sub-chunks as it requires
    // knowledge of the full column. Entrances will be handled separately
    // when all sub-chunks in a column are ready.
  }
}
