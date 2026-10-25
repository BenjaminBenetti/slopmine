import type { WeatherLook } from './WeatherLook.ts'

/**
 * The weather as other systems see it - sound, items (Storm Glass, Sky Bell),
 * blocks (crops), creatures. setupWeather registers the provider at startup;
 * until then (workers, tests) every query answers "no weather".
 */

/** The weather where the player is, this frame. */
export interface WeatherSnapshot {
  /** 1 surface, 0 Hell. */
  readonly layer: 0 | 1
  /** WeatherCatalog id and display name. */
  readonly weatherId: string
  readonly weatherName: string
  /** The live blended look (particles by PARTICLE_KINDS order, wind, lightning rate, spectacles...). */
  readonly look: Readonly<WeatherLook>
  /** 0 sheltered .. 1 under open sky (share of the sky open around the player's head). */
  readonly exposure: number
  /** Wind direction (unit) and strength 0-1 (with gusts). */
  readonly windX: number
  readonly windZ: number
  readonly windStrength: number
  /** 0-1: how wet the open ground is. */
  readonly wetness: number
  /** 0-1: a rainbow in the sky. */
  readonly rainbow: number
}

export interface WeatherForecast {
  readonly weatherId: string
  readonly weatherName: string
}

export interface WeatherProvider {
  snapshot(): WeatherSnapshot
  /** Dominant weather id at a place (the layer from its height). */
  weatherAt(x: number, y: number, z: number): string
  /** Whether rain (or anything wet) is falling on this cell: wet weather and open sky above it. */
  isRainingOn(x: number, y: number, z: number): boolean
  /** The weather at the player in `seconds`. */
  forecast(seconds: number): WeatherForecast
  /**
   * Ring a Sky Bell at a place: rain if the sky is fair there, a clear sky if
   * it is wet. Returns what was cast, or null where a bell does nothing (Hell).
   */
  ringSkyBell(x: number, z: number): 'rain' | 'clear' | null
}

let provider: WeatherProvider | null = null

export function registerWeatherProvider(p: WeatherProvider): void {
  provider = p
}

export function getWeatherSnapshot(): WeatherSnapshot | null {
  return provider ? provider.snapshot() : null
}

export function weatherAt(x: number, y: number, z: number): string {
  return provider ? provider.weatherAt(x, y, z) : 'clear'
}

export function isRainingOn(x: number, y: number, z: number): boolean {
  return provider ? provider.isRainingOn(x, y, z) : false
}

export function getWeatherForecast(seconds: number): WeatherForecast | null {
  return provider ? provider.forecast(seconds) : null
}

export function ringSkyBell(x: number, z: number): 'rain' | 'clear' | null {
  return provider ? provider.ringSkyBell(x, z) : null
}
