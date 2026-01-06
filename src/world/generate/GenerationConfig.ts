const STORAGE_KEY = 'slopmine:worldConfig'

export type BiomeType = 'plains' | 'grassy-hills'

export interface IGenerationConfig {
  seed: number
  chunkDistance: number
  seaLevel: number
  biome: BiomeType
}

const DEFAULT_CONFIG: IGenerationConfig = {
  seed: Date.now(),
  chunkDistance: 4,
  seaLevel: 64,
  biome: 'grassy-hills',
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
        return { config: { ...DEFAULT_CONFIG, ...parsed, ...overrides }, wasStored: true }
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

  get biome(): BiomeType {
    return this.config.biome
  }

  set chunkDistance(value: number) {
    this.config.chunkDistance = Math.max(1, Math.min(32, value))
    this.save()
  }

  getUnloadDistance(): number {
    return this.config.chunkDistance
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
