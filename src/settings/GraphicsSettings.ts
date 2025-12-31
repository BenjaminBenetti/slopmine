const STORAGE_KEY = 'slopmine:graphicsSettings'

export interface IGraphicsSettings {
  cullingEnabled: boolean
}

const DEFAULT_SETTINGS: IGraphicsSettings = {
  cullingEnabled: true,
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
