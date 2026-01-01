import type { Chunk } from '../../chunks/Chunk.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import { SpaghettiCarver } from './SpaghettiCarver.ts'
import { CheeseCarver } from './CheeseCarver.ts'
import { EntranceDetector } from './EntranceDetector.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/**
 * Main orchestrator for cave generation.
 * Coordinates spaghetti tunnels, cheese chambers, and entrance detection.
 */
export class CaveCarver {
  private readonly spaghettiCarver: SpaghettiCarver
  private readonly cheeseCarver: CheeseCarver
  private readonly entranceDetector: EntranceDetector

  constructor(seed: number) {
    this.spaghettiCarver = new SpaghettiCarver(seed)
    this.cheeseCarver = new CheeseCarver(seed + 1000)
    this.entranceDetector = new EntranceDetector()
  }

  /**
   * Carve caves into the chunk terrain.
   */
  async carve(
    chunk: Chunk,
    settings: CaveSettings,
    getHeightAt: HeightGetter,
    frameBudget: FrameBudget
  ): Promise<void> {
    // Track entrance positions for later widening
    const entrances: Array<{ localX: number; y: number; localZ: number }> = []

    // First pass: carve spaghetti tunnels
    await this.spaghettiCarver.carve(
      chunk,
      settings,
      getHeightAt,
      frameBudget,
      settings.entrancesEnabled ? entrances : undefined
    )

    // Second pass: carve cheese chambers
    if (settings.cheeseEnabled) {
      await this.cheeseCarver.carve(
        chunk,
        settings,
        getHeightAt,
        frameBudget,
        settings.entrancesEnabled ? entrances : undefined
      )
    }

    // Third pass: widen entrances for natural appearance
    if (settings.entrancesEnabled && entrances.length > 0) {
      this.entranceDetector.widenEntrances(chunk, entrances, settings)
    }
  }
}
