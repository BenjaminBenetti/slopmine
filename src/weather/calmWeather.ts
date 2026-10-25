import { getWeatherSnapshot } from './WeatherHooks.ts'
import { PARTICLE_KINDS } from './ParticleKinds.ts'

/** Kinds that count as foul weather (things falling or blowing - not floating pollen, motes or wisps). */
const FOUL = PARTICLE_KINDS.map((k) => k.fall >= 1 || k.id === 'sand' || k.id === 'bone')

/**
 * How calm the weather is where the player is, 0-1: 1 in fair weather, toward
 * 0 in rain, snow, sandstorms or a gale. Insects (fireflies, butterflies)
 * scale their numbers by it.
 */
export function calmWeather(): number {
  const weather = getWeatherSnapshot()
  if (!weather) return 1
  let falling = 0
  for (let i = 0; i < FOUL.length; i++) if (FOUL[i]) falling += weather.look.particles[i]
  const wind = Math.max(0, (weather.windStrength - 0.5) * 2)
  return Math.max(0, 1 - Math.max(Math.min(1, falling * 1.6), wind))
}
