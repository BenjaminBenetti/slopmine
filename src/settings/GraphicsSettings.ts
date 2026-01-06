const STORAGE_KEY = 'slopmine:graphicsSettings'

export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4k' | 'native'
export type FramerateLimit = 30 | 60 | 80 | 120 | 240
export type ShadowMapSize = 1024 | 2048 | 4096 | 8192

export interface IGraphicsSettings {
  cullingEnabled: boolean
  resolutionPreset: ResolutionPreset
  framerateLimit: FramerateLimit
  shadowsEnabled: boolean
  shadowMapSize: ShadowMapSize
}

const DEFAULT_SETTINGS: IGraphicsSettings = {
  cullingEnabled: true,
  resolutionPreset: 'native',
  framerateLimit: 60,
  shadowsEnabled: true,
  shadowMapSize: 4096,
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

  private load(): IGraphicsSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<IGraphicsSettings>
        return { ...DEFAULT_SETTINGS, ...parsed }
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
