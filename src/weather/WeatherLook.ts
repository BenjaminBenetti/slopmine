import { PARTICLE_KIND_COUNT, PARTICLE_KIND_INDEX, type ParticleKindId } from './ParticleKinds.ts'

/**
 * What a weather looks, sounds and plays like, as numbers that blend: the
 * live weather at the player is a weighted mix of the weathers around it
 * (weather cell borders, a front arriving, biome borders). Neutral values =
 * no change from the biome's own atmosphere. Colours are linear multipliers.
 */
export type Rgb = [number, number, number]

export interface WeatherLook {
  // Sky (the overworld dome)
  /** Cloud cover toward a full overcast (0 = the biome's fair-weather clouds). */
  cloud: number
  /** How dark the cloud base gets (storms). */
  cloudDark: number
  readonly cloudTint: Rgb
  /** The dome's colour pulled toward a grey cloud-light (overcast skies). */
  skyGrey: number
  /** Sky, fog and horizon tint (sand-orange, ash-brown, mist-white), applied by skyTintAmount. */
  readonly skyTint: Rgb
  skyTintAmount: number
  /** Sun disc and glow hidden (0 shown .. 1 gone). */
  sunDim: number

  // Air
  /** Extra haze: extinction per block (1 / visibility distance), adds to the aerial haze. */
  haze: number
  /** Ground fog density per block below groundFogTop (valley fog, sea fog, ghost fog). */
  groundFog: number
  /** World Y of the ground fog's top (it thins out above over a few blocks); Hell weathers: blocks above the cavern floor. */
  groundFogTop: number

  // Light
  /** Multiplier on sky light. */
  daylight: number
  /** Multiplier on the sun's directional light (overcast light is soft: shadows fade). */
  sunLight: number
  readonly lightTint: Rgb
  /** Hell: multiplier on the cavern's light floor, and how much it pulses (resonance). */
  readonly floorTint: Rgb
  glowPulse: number

  // In the air
  /** Density of each particle kind (PARTICLE_KINDS order), 0-1. */
  readonly particles: Float32Array
  /** Wind: 0 calm .. 1 a gale. */
  wind: number
  /** Lightning strikes per minute around the player. */
  lightning: number
  readonly lightningColor: Rgb

  // Spectacles
  aurora: number
  meteors: number
  /** Bleached, shimmering heat. */
  heatHaze: number
  /** A rainbow in the sky now (sun showers; after-shower rainbows come from WeatherState). */
  rainbow: number
  /** Water glows blue after dark (glowing tide). */
  waterGlow: number
  /** Whirlwinds of sand roam (dust devils). */
  dustDevils: number

  // What it does
  /** Rain: crops grow, farmland wets, fire goes out. */
  wet: number
  /** Hail stings the unsheltered. */
  hail: number
  /** Falling embers can set the unsheltered alight. */
  embers: number
  /** Sulphur rain poisons the unsheltered. */
  sulphur: number
  /** Freezing: frostbite for the unsheltered. */
  cold: number
  /** The wind pushes the unsheltered along. */
  gale: number
}

/**
 * How a weather definition spells its look: any subset, distances instead of
 * extinctions, particles by name. Unset = neutral.
 */
export type WeatherLookSpec = Partial<Omit<WeatherLook, 'particles' | 'haze' | 'cloudTint' | 'skyTint' | 'lightTint' | 'floorTint' | 'lightningColor'>> & {
  /** Visibility through the weather (blocks): 63% hidden at this distance. */
  hazeDistance?: number
  particles?: Partial<Record<ParticleKindId, number>>
  cloudTint?: Rgb
  skyTint?: Rgb
  lightTint?: Rgb
  floorTint?: Rgb
  lightningColor?: Rgb
}

export function createWeatherLook(): WeatherLook {
  return {
    cloud: 0,
    cloudDark: 0,
    cloudTint: [1, 1, 1],
    skyGrey: 0,
    skyTint: [1, 1, 1],
    skyTintAmount: 0,
    sunDim: 0,
    haze: 0,
    groundFog: 0,
    groundFogTop: 0,
    daylight: 1,
    sunLight: 1,
    lightTint: [1, 1, 1],
    floorTint: [1, 1, 1],
    glowPulse: 0,
    particles: new Float32Array(PARTICLE_KIND_COUNT),
    wind: 0.15,
    lightning: 0,
    lightningColor: [0.85, 0.9, 1.0],
    aurora: 0,
    meteors: 0,
    heatHaze: 0,
    rainbow: 0,
    waterGlow: 0,
    dustDevils: 0,
    wet: 0,
    hail: 0,
    embers: 0,
    sulphur: 0,
    cold: 0,
    gale: 0,
  }
}

const SCALAR_KEYS = [
  'cloud', 'cloudDark', 'skyGrey', 'skyTintAmount', 'sunDim', 'haze', 'groundFog', 'groundFogTop', 'daylight',
  'sunLight', 'glowPulse', 'wind', 'lightning', 'aurora', 'meteors', 'heatHaze', 'rainbow', 'waterGlow', 'dustDevils',
  'wet', 'hail', 'embers', 'sulphur', 'cold', 'gale',
] as const satisfies readonly (keyof WeatherLook)[]

const COLOR_KEYS = ['cloudTint', 'skyTint', 'lightTint', 'floorTint', 'lightningColor'] as const satisfies readonly (keyof WeatherLook)[]

/** Resolve a definition's spec into a full look. */
export function resolveLook(spec: WeatherLookSpec): WeatherLook {
  const look = createWeatherLook()
  for (const key of SCALAR_KEYS) {
    const value = spec[key as keyof WeatherLookSpec]
    if (typeof value === 'number') look[key] = value
  }
  if (spec.hazeDistance !== undefined) look.haze = 1 / spec.hazeDistance
  for (const key of COLOR_KEYS) {
    const value = spec[key]
    if (value) look[key].splice(0, 3, ...value)
  }
  for (const [id, density] of Object.entries(spec.particles ?? {}) as [ParticleKindId, number][]) {
    look.particles[PARTICLE_KIND_INDEX[id]] = density
  }
  return look
}

/** Zero a look before accumulating a blend into it. */
export function clearLook(out: WeatherLook): void {
  for (const key of SCALAR_KEYS) out[key] = 0
  for (const key of COLOR_KEYS) out[key].fill(0)
  out.particles.fill(0)
}

/**
 * out += look × weight. The ground fog's top is weighted by its fog and the
 * lightning colour by its rate (a weather without them has no say in them).
 */
export function addLook(out: WeatherLook, look: WeatherLook, weight: number): void {
  for (const key of SCALAR_KEYS) if (key !== 'groundFogTop') out[key] += look[key] * weight
  out.groundFogTop += look.groundFogTop * look.groundFog * weight
  for (const key of COLOR_KEYS) {
    const o = out[key]
    const c = look[key]
    const w = key === 'lightningColor' ? weight * look.lightning : weight
    o[0] += c[0] * w
    o[1] += c[1] * w
    o[2] += c[2] * w
  }
  const op = out.particles
  const lp = look.particles
  for (let i = 0; i < op.length; i++) op[i] += lp[i] * weight
}

/** Finish a blend accumulated with addLook: divide by the total weight. */
export function finishLook(out: WeatherLook, totalWeight: number): void {
  // The weighted sums of the fog top and lightning colour divide by their own weights
  out.groundFogTop = out.groundFog > 1e-6 ? out.groundFogTop / out.groundFog : 0
  const strikes = out.lightning
  const scale = 1 / totalWeight
  for (const key of SCALAR_KEYS) if (key !== 'groundFogTop') out[key] *= scale
  for (const key of COLOR_KEYS) {
    const o = out[key]
    const k = key === 'lightningColor' ? (strikes > 1e-6 ? 1 / strikes : 0) : scale
    o[0] *= k
    o[1] *= k
    o[2] *= k
  }
  if (strikes <= 1e-6) out.lightningColor.splice(0, 3, 0.85, 0.9, 1.0)
  for (let i = 0; i < out.particles.length; i++) out.particles[i] *= scale
}

/**
 * Ease `out` toward `target` by k (0-1). The ground fog's top follows only
 * while there is fog to show, so it never sweeps through the world.
 */
export function easeLook(out: WeatherLook, target: WeatherLook, k: number): void {
  for (const key of SCALAR_KEYS) {
    if (key === 'groundFogTop') continue
    out[key] += (target[key] - out[key]) * k
  }
  if (out.groundFog < 1e-4) out.groundFogTop = target.groundFogTop
  else out.groundFogTop += (target.groundFogTop - out.groundFogTop) * k
  for (const key of COLOR_KEYS) {
    const o = out[key]
    const t = target[key]
    o[0] += (t[0] - o[0]) * k
    o[1] += (t[1] - o[1]) * k
    o[2] += (t[2] - o[2]) * k
  }
  for (let i = 0; i < out.particles.length; i++) out.particles[i] += (target.particles[i] - out.particles[i]) * k
}

/** Copy a look. */
export function copyLook(out: WeatherLook, src: WeatherLook): void {
  for (const key of SCALAR_KEYS) out[key] = src[key]
  for (const key of COLOR_KEYS) out[key].splice(0, 3, ...src[key])
  out.particles.set(src.particles)
}

/** Total density of everything falling (for sky curtains and sound). */
export function totalParticles(look: WeatherLook): number {
  let sum = 0
  for (let i = 0; i < look.particles.length; i++) sum += look.particles[i]
  return sum
}
