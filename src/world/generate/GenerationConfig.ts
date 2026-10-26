const STORAGE_KEY = 'slopmine:worldConfig'

export type BiomeType =
  // Layer 1 (surface)
  | 'plains'
  | 'grassy-hills'
  | 'desert'
  | 'volcanic'
  | 'jungle'
  | 'swamp'
  | 'pine-forest'
  | 'coastal-rainforest'
  | 'ocean'
  // Layer 0 (the Hell layer)
  | 'hell' // the Molten Wastes
  | 'ossuary'
  | 'ember-grove'
  | 'crystal-abyss'
  | 'cocytus'

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

/**
 * Largest selectable full-detail chunk distance. Sub-chunk count grows roughly
 * with d² × vertical range, so beyond 16 memory and draw objects explode;
 * longer views come from the LOD far-terrain ring instead.
 */
export const MAX_CHUNK_DISTANCE = 16

/**
 * Cap on the vertical load radius (in sub-chunks). The vertical ellipsoid
 * radius is ceil(d/2); past d=8 that loads deep underground and high sky
 * sub-chunks nobody can see from the surface.
 */
export const MAX_VERTICAL_CHUNK_DISTANCE = 4

/**
 * Extra horizontal distance (chunks) before a loaded column unloads. Without
 * slack, walking back and forth across a chunk border unloads and regenerates
 * the whole edge ring every crossing.
 */
export const UNLOAD_HYSTERESIS_CHUNKS = 1.5

function clampChunkDistance(value: number): number {
  return Math.max(1, Math.min(MAX_CHUNK_DISTANCE, value))
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

/**
 * The Hell cavern's rock ceiling: the lowest Y of the surface layer's fill
 * (sea level - terrain thickness; saved configs never override either). Y 128
 * up to it is the cavern's open top. Shader constants (the cavern ceiling
 * haze in DistanceFog) use this value; world generation derives the same Y
 * from its config.
 */
export const HELL_CEILING_Y = DEFAULT_CONFIG.seaLevel - DEFAULT_CONFIG.terrainThickness

export class GenerationConfig {
  private config: IGenerationConfig

  constructor(overrides?: Partial<IGenerationConfig>) {
    const { config, wasStored } = this.load(overrides)
    // Older saves allowed distances up to 32 - clamp to the current cap
    config.chunkDistance = clampChunkDistance(config.chunkDistance)
    this.config = config
    if (!wasStored) {
      this.save()
    }
  }

  private load(overrides?: Partial<IGenerationConfig>): { config: IGenerationConfig; wasStored: boolean } {
    // Workers don't have localStorage - skip storage in worker context
    if (typeof localStorage === 'undefined') {
      return { config: { ...DEFAULT_CONFIG, ...overrides }, wasStored: false }
    }
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
    // Workers don't have localStorage - skip storage in worker context
    if (typeof localStorage === 'undefined') {
      return
    }
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
    this.config.chunkDistance = clampChunkDistance(value)
    this.save()
  }

  /**
   * Horizontal distance (chunks) beyond which loaded columns unload:
   * the load distance plus hysteresis.
   */
  getUnloadDistance(): number {
    return this.config.chunkDistance + UNLOAD_HYSTERESIS_CHUNKS
  }

  /**
   * Get the vertical (Y-axis) chunk distance: half of the horizontal
   * distance rounded up, capped at MAX_VERTICAL_CHUNK_DISTANCE.
   */
  getVerticalDistance(): number {
    return Math.min(Math.ceil(this.config.chunkDistance / 2), MAX_VERTICAL_CHUNK_DISTANCE)
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
