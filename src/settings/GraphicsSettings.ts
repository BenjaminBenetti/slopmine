const STORAGE_KEY = 'slopmine:graphicsSettings'

export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4k' | 'native'

export interface IGraphicsSettings {
  cullingEnabled: boolean
  resolutionPreset: ResolutionPreset
}

const DEFAULT_SETTINGS: IGraphicsSettings = {
  cullingEnabled: true,
  resolutionPreset: 'native',
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
