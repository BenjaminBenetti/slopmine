const STORAGE_KEY = 'slopmine:worldConfig'

export type BiomeType = 'plains' | 'grassy-hills' | 'desert' | 'volcanic' | 'jungle' | 'swamp' | 'rocky'

/**
 * Vertical layer boundary Y coordinate.
 * Layer 0: Y=0 to LAYER_BOUNDARY_Y-1 (sub-chunks 0-3)
 * Layer 1: Y=LAYER_BOUNDARY_Y to 511 (sub-chunks 4-15)
 */
export const LAYER_BOUNDARY_Y = 128

/**
 * Sub-chunk index threshold for layer boundary.
 * Sub-chunks 0-3 are Layer 0, 4-15 are Layer 1.
 */
export const LAYER_BOUNDARY_SUB_CHUNK = 4

/**
 * Get the layer (0 or 1) for a given sub-chunk Y index.
 * @param subY Sub-chunk index (0-15)
 * @returns 0 for underground layer, 1 for surface layer
 */
export function getLayerForSubChunk(subY: number): 0 | 1 {
  return subY < LAYER_BOUNDARY_SUB_CHUNK ? 0 : 1
}

export interface IGenerationConfig {
  seed: number
  chunkDistance: number
  seaLevel: number
  terrainThickness: number
}

const DEFAULT_CONFIG: IGenerationConfig = {
  seed: Date.now(),
  chunkDistance: 8,
  seaLevel: 240,
  terrainThickness: 100,
}

export class GenerationConfig {
  private config: IGenerationConfig

  constructor(overrides?: Partial<IGenerationConfig>) {
    const { config, wasStored } = this.load(overrides)
    this.config = config
    if (!wasStored) {
      this.save()
    }
  }

  private load(overrides?: Partial<IGenerationConfig>): { config: IGenerationConfig; wasStored: boolean } {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<IGenerationConfig>
        // Ignore seaLevel and terrainThickness from storage - always use defaults
        // This ensures terrain height changes are applied without users clearing site data
        const { seaLevel: _sl, terrainThickness: _tt, ...restParsed } = parsed
        return { config: { ...DEFAULT_CONFIG, ...restParsed, ...overrides }, wasStored: true }
      }
    } catch (e) {
      console.warn('Failed to load world config:', e)
    }
    return { config: { ...DEFAULT_CONFIG, ...overrides }, wasStored: false }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config))
    } catch (e) {
      console.warn('Failed to save world config:', e)
    }
  }

  get seed(): number {
    return this.config.seed
  }

  get chunkDistance(): number {
    return this.config.chunkDistance
  }

  get seaLevel(): number {
    return this.config.seaLevel
  }

  get terrainThickness(): number {
    return this.config.terrainThickness
  }

  set chunkDistance(value: number) {
    this.config.chunkDistance = Math.max(1, Math.min(32, value))
    this.save()
  }

  getUnloadDistance(): number {
    return this.config.chunkDistance
  }

  /**
   * Get the vertical (Y-axis) chunk distance.
   * This is half of the horizontal distance, rounded up.
   */
  getVerticalDistance(): number {
    return Math.ceil(this.config.chunkDistance / 2)
  }

  reset(newSeed?: number): void {
    this.config = { ...DEFAULT_CONFIG, seed: newSeed ?? Date.now() }
    this.save()
  }

  /** Regenerate the world seed while preserving other settings */
  regenerateSeed(): void {
    this.config.seed = Date.now()
    this.save()
  }

  getConfig(): IGenerationConfig {
    return { ...this.config }
  }
}
