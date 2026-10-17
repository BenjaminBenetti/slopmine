const STORAGE_KEY = 'slopmine:audioSettings'

/** Volume sliders, 0-100 each (perceptual: the engine squares them). */
export interface IAudioSettings {
  master: number
  music: number
  effects: number
  ambience: number
}

export type AudioSettingKey = keyof IAudioSettings

const DEFAULT_SETTINGS: IAudioSettings = {
  master: 100,
  music: 60,
  effects: 100,
  ambience: 60,
}

export class AudioSettings {
  private settings: IAudioSettings
  private readonly listeners = new Set<(settings: Readonly<IAudioSettings>) => void>()

  constructor() {
    this.settings = this.load()
  }

  get(key: AudioSettingKey): number {
    return this.settings[key]
  }

  set(key: AudioSettingKey, value: number): void {
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : DEFAULT_SETTINGS[key]
    if (clamped === this.settings[key]) return
    this.settings[key] = clamped
    this.save()
    for (const listener of this.listeners) listener(this.settings)
  }

  snapshot(): Readonly<IAudioSettings> {
    return { ...this.settings }
  }

  /** Called after every change. Returns an unsubscribe function. */
  onChange(listener: (settings: Readonly<IAudioSettings>) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private load(): IAudioSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<IAudioSettings>
        const merged = { ...DEFAULT_SETTINGS }
        for (const key of Object.keys(DEFAULT_SETTINGS) as AudioSettingKey[]) {
          const value = parsed[key]
          if (typeof value === 'number' && Number.isFinite(value)) merged[key] = Math.max(0, Math.min(100, value))
        }
        return merged
      }
    } catch (e) {
      console.warn('Failed to load audio settings:', e)
    }
    return { ...DEFAULT_SETTINGS }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch (e) {
      console.warn('Failed to save audio settings:', e)
    }
  }
}
