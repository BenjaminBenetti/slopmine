const STORAGE_KEY = 'slopmine:graphicsSettings'

export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4k' | 'native'
export type FramerateLimit = 30 | 60 | 80 | 120 | 240 | 9999
export type ShadowMapSize = 1024 | 2048 | 4096 | 8192
/** Far-terrain (LOD) distance in chunks. */
export type LodDistance = 12 | 16 | 20 | 24 | 32

export const LOD_DISTANCE_OPTIONS: readonly LodDistance[] = [12, 16, 20, 24, 32]

/** Block texture minification: crisp pixel art or smooth (trilinear). */
export const TEXTURE_FILTERING_OPTIONS = ['crisp', 'smooth'] as const
export type TextureFiltering = (typeof TEXTURE_FILTERING_OPTIONS)[number]

export interface IGraphicsSettings {
  cullingEnabled: boolean
  resolutionPreset: ResolutionPreset
  framerateLimit: FramerateLimit
  shadowsEnabled: boolean
  shadowMapSize: ShadowMapSize
  /** Draw low-detail far terrain beyond the full-detail render distance. */
  lodEnabled: boolean
  lodDistance: LodDistance
  /** Block texture minification style (applied by TextureLoader.setTextureFiltering). */
  textureFiltering: TextureFiltering
}

const DEFAULT_SETTINGS: IGraphicsSettings = {
  cullingEnabled: false,
  resolutionPreset: 'native',
  framerateLimit: 9999,
  shadowsEnabled: false,
  shadowMapSize: 4096,
  lodEnabled: true,
  lodDistance: 24,
  textureFiltering: 'crisp',
}

export class GraphicsSettings {
  private settings: IGraphicsSettings

  constructor() {
    this.settings = this.load()
  }

  get cullingEnabled(): boolean {
    return this.settings.cullingEnabled
  }

  set cullingEnabled(value: boolean) {
    this.settings.cullingEnabled = value
    this.save()
  }

  get resolutionPreset(): ResolutionPreset {
    return this.settings.resolutionPreset
  }

  set resolutionPreset(value: ResolutionPreset) {
    this.settings.resolutionPreset = value
    this.save()
  }

  get framerateLimit(): FramerateLimit {
    return this.settings.framerateLimit
  }

  set framerateLimit(value: FramerateLimit) {
    this.settings.framerateLimit = value
    this.save()
  }

  get shadowsEnabled(): boolean {
    return this.settings.shadowsEnabled
  }

  set shadowsEnabled(value: boolean) {
    this.settings.shadowsEnabled = value
    this.save()
  }

  get shadowMapSize(): ShadowMapSize {
    return this.settings.shadowMapSize
  }

  set shadowMapSize(value: ShadowMapSize) {
    this.settings.shadowMapSize = value
    this.save()
  }

  get lodEnabled(): boolean {
    return this.settings.lodEnabled
  }

  set lodEnabled(value: boolean) {
    this.settings.lodEnabled = value
    this.save()
  }

  get lodDistance(): LodDistance {
    return this.settings.lodDistance
  }

  set lodDistance(value: LodDistance) {
    this.settings.lodDistance = value
    this.save()
  }

  get textureFiltering(): TextureFiltering {
    return this.settings.textureFiltering
  }

  set textureFiltering(value: TextureFiltering) {
    this.settings.textureFiltering = value
    this.save()
  }

  private load(): IGraphicsSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<IGraphicsSettings>
        const settings = { ...DEFAULT_SETTINGS, ...parsed }
        if (!LOD_DISTANCE_OPTIONS.includes(settings.lodDistance)) {
          settings.lodDistance = DEFAULT_SETTINGS.lodDistance
        }
        if (!TEXTURE_FILTERING_OPTIONS.includes(settings.textureFiltering)) {
          settings.textureFiltering = DEFAULT_SETTINGS.textureFiltering
        }
        return settings
      }
    } catch (e) {
      console.warn('Failed to load graphics settings:', e)
    }
    return { ...DEFAULT_SETTINGS }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch (e) {
      console.warn('Failed to save graphics settings:', e)
    }
  }
}
