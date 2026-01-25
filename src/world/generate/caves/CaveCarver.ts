import type { IChunkData } from '../../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../../interfaces/ISubChunkData.ts'
import type { CaveSettings } from '../BiomeGenerator.ts'
import type { FrameBudget } from '../../../core/FrameBudget.ts'
import { TunnelNetworkCarver } from './TunnelNetworkCarver.ts'
import { ChamberCarver } from './ChamberCarver.ts'
import { NoiseEntranceCarver } from './NoiseEntranceCarver.ts'

export type HeightGetter = (worldX: number, worldZ: number) => number

/**
 * Main orchestrator for cave generation.
 * Uses Perlin worm algorithm to create interconnected tunnel networks.
 * Uses chamber carving to create large underground caverns.
 * Uses noise-based carving for visible surface entrances.
 */
export class CaveCarver {
  private readonly tunnelCarver: TunnelNetworkCarver
  private readonly chamberCarver: ChamberCarver
  private readonly entranceCarver: NoiseEntranceCarver

  constructor(seed: number) {
    this.tunnelCarver = new TunnelNetworkCarver(seed)
    this.chamberCarver = new ChamberCarver(seed)
    this.entranceCarver = new NoiseEntranceCarver(seed)
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
    // Carve underground tunnels first
    await this.tunnelCarver.carve(chunk, settings, getHeightAt, frameBudget)

    // Carve large chambers
    await this.chamberCarver.carve(chunk, settings, getHeightAt)

    // Then carve surface entrances (these carve from surface down)
    await this.entranceCarver.carve(chunk, settings, getHeightAt)
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
      // Sub-chunk is outside cave Y range for tunnels
      // But entrances and chambers may still extend into this range
    } else {
      // Carve tunnels
      await this.tunnelCarver.carveSubChunk(subChunk, settings, getHeightAt, minWorldY, maxWorldY)
    }

    // Carve large chambers (these have their own Y range settings)
    await this.chamberCarver.carveSubChunk(subChunk, settings, getHeightAt, minWorldY, maxWorldY)

    // Carve surface entrances (these operate based on surface Y, not cave Y range)
    await this.entranceCarver.carveSubChunk(subChunk, settings, getHeightAt, minWorldY, maxWorldY)
  }
}
