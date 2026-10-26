/**
 * Background ambience: looping noise beds crossfaded by environment (surface
 * wind, cave hollowness, each Hell biome's air, underwater) and by the
 * weather (rain, hail, gales, sand, blizzards, embers, glitter, the aurora -
 * muffled under shelter), plus sparse one-shot details placed around the
 * listener (birds, drips, lava pops, ice creaks...). Beds render lazily the
 * first time an environment needs them.
 */

import { PARTICLE_KIND_INDEX, type ParticleKindId } from '../weather/ParticleKinds.ts'
import type { WeatherSnapshot } from '../weather/WeatherHooks.ts'
import type { AudioEngine } from './AudioEngine.ts'
import { RenderPriority } from './AudioSynthClient.ts'
import type { SoundBank } from './SoundBank.ts'
import type { NamedSoundId } from './SoundLibrary.ts'

/** Beds render at 22.05 kHz: noise textures under 10 kHz. */
const BED_SAMPLE_RATE = 22050
/** Bed loudness (dBFS, before the ambience bus) at weight 1. */
const BED_LOUDNESS = -31
/** Crossfade time constant between environments (seconds). */
const BED_FADE = 1.6

export type BedId =
  | 'bed.wind' | 'bed.night' | 'bed.cave' | 'bed.hell' | 'bed.ossuary' | 'bed.embergrove' | 'bed.crystal' | 'bed.cocytus'
  | 'bed.underwater'
  // Weather (synth/weatherSounds.ts)
  | 'bed.rain' | 'bed.rain_heavy' | 'bed.drizzle' | 'bed.hail' | 'bed.gale' | 'bed.sandstorm' | 'bed.blizzard'
  | 'bed.embers' | 'bed.shimmer' | 'bed.aurora' | 'bed.roof'
  // Water (synth/waterSounds.ts)
  | 'bed.surf' | 'bed.stream' | 'bed.lapping'

export interface AmbienceContext {
  layer: 0 | 1
  biome: string
  /** 0 (enclosed) .. 1 (open sky), from the sky light at the camera. */
  outdoors: number
  cameraY: number
  /** Liquid family the camera is in, or null. */
  submergedIn: string | null
  /** 0 by day .. 1 at night (the overworld clock; the surface only). */
  night: number
  /** The cave biome the player is in, or null above ground. */
  caveBiome: string | null
  /** The weather where the player is (src/weather/), or null before it runs. */
  weather: WeatherSnapshot | null
  /** The water around the player (src/water/WaterHooks.ts): surf, a river, a boat. */
  water?: { readonly sea: number; readonly river: number; readonly boat: number }
}

interface Bed {
  gain: GainNode
  source: AudioBufferSourceNode | null
  loading: boolean
  calibration: number
  weight: number
  silentFor: number
}

interface DetailRule {
  id: NamedSoundId
  /** Mean seconds between occurrences. */
  every: number
}

const VEGETATED = new Set(['plains', 'grassy-hills', 'pine-forest', 'coastal-rainforest', 'jungle'])

/** How many crickets sing at night in each surface biome (bed weight). */
const NIGHT_CHORUS: Record<string, number> = {
  plains: 0.85,
  'grassy-hills': 0.8,
  'pine-forest': 0.55,
  'coastal-rainforest': 0.7,
  jungle: 0.9,
  swamp: 0.75,
  desert: 0.3,
  volcanic: 0,
}

/** Where owls call at night. */
const OWL_BIOMES = new Set(['pine-forest', 'coastal-rainforest', 'jungle', 'grassy-hills'])

const HELL_BEDS: Record<string, Partial<Record<BedId, number>>> = {
  hell: { 'bed.hell': 1 },
  ossuary: { 'bed.ossuary': 0.9, 'bed.hell': 0.3 },
  'ember-grove': { 'bed.embergrove': 0.85, 'bed.hell': 0.3 },
  'crystal-abyss': { 'bed.crystal': 0.7, 'bed.hell': 0.35 },
  cocytus: { 'bed.cocytus': 0.85, 'bed.hell': 0.2 },
}

const HELL_DETAILS: Record<string, DetailRule[]> = {
  hell: [
    { id: 'amb.lavapop', every: 7 },
    { id: 'amb.distantrumble', every: 40 },
  ],
  ossuary: [
    { id: 'amb.bonechime', every: 18 },
    { id: 'amb.distantrumble', every: 55 },
  ],
  'ember-grove': [{ id: 'amb.sporepuff', every: 10 }],
  'crystal-abyss': [{ id: 'amb.crystalping', every: 9 }],
  cocytus: [{ id: 'amb.icecreak', every: 15 }],
}

/** Cave biomes layer a Hell bed under the cave hollowness where it fits. */
const CAVE_BEDS: Record<string, Partial<Record<BedId, number>>> = {
  crystal_geode: { 'bed.crystal': 0.45 },
  frozen_cave: { 'bed.cocytus': 0.4 },
  fungal_hollow: { 'bed.embergrove': 0.3 },
  magma_chamber: { 'bed.hell': 0.45 },
}

/** Each cave biome's details (the generic cave's drips and rumbles otherwise). */
const CAVE_DETAILS: Record<string, DetailRule[]> = {
  dripstone_caverns: [{ id: 'amb.drip', every: 3.5 }, { id: 'amb.distantrumble', every: 70 }],
  mossy_grotto: [{ id: 'amb.drip', every: 9 }, { id: 'amb.frog', every: 30 }],
  glowworm_grotto: [{ id: 'amb.drip', every: 5 }],
  crystal_geode: [{ id: 'amb.crystalping', every: 8 }, { id: 'amb.drip', every: 14 }],
  fungal_hollow: [{ id: 'amb.sporepuff', every: 9 }, { id: 'amb.drip', every: 16 }],
  frozen_cave: [{ id: 'amb.icecreak', every: 13 }],
  magma_chamber: [{ id: 'amb.lavapop', every: 6 }, { id: 'amb.distantrumble', every: 35 }],
  webbed_hollow: [{ id: 'amb.drip', every: 14 }, { id: 'amb.bonechime', every: 40 }],
}

/**
 * Level of each weather bed at full weight, relative to the others (every bed
 * is first calibrated to BED_LOUDNESS): rain sits under the surface wind,
 * glitter and the aurora are barely there.
 */
const WEATHER_BED_LEVEL: Partial<Record<BedId, number>> = {
  'bed.rain': 0.75,
  'bed.rain_heavy': 0.9,
  'bed.drizzle': 0.55,
  'bed.hail': 0.7,
  'bed.gale': 0.95,
  'bed.sandstorm': 0.9,
  'bed.blizzard': 0.95,
  'bed.embers': 0.55,
  'bed.shimmer': 0.4,
  'bed.aurora': 0.3,
  'bed.roof': 0.6,
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Weather bed weights from the live weather. Under shelter the weather is
 * heard faintly (30 % near the surface, 6 % deep in a cave), and rain
 * drums on the roof instead.
 */
export function weatherBedWeights(ctx: AmbienceContext): Partial<Record<BedId, number>> {
  const w = ctx.weather
  if (!w) return {}
  const look = w.look
  const p = (kind: ParticleKindId): number => look.particles[PARTICLE_KIND_INDEX[kind]] ?? 0
  const exposure = Math.min(1, Math.max(0, w.exposure))
  const nearSurface = ctx.layer === 0 || ctx.outdoors > 0.2 || ctx.cameraY > 236
  const floor = nearSurface ? 0.3 : 0.06
  const open = floor + (1 - floor) * exposure
  const wind = Math.min(1, Math.max(0, w.windStrength))

  const wetFall = p('rain') + 0.9 * p('sulphur') + 0.3 * p('firefall')
  const rainLight = Math.min(1, wetFall * 1.8)
  const rainHeavy = smoothstep(0.55, 1, wetFall)
  // Sandstorms and blizzards carry their own wind: the gale howl backs off under them
  const ownWind = Math.min(1, p('sand') + p('bone') + (p('snow') + p('blacksnow')) * wind)
  const raw: Partial<Record<BedId, number>> = {
    'bed.rain': rainLight * (1 - 0.6 * rainHeavy) * open,
    'bed.rain_heavy': rainHeavy * open,
    'bed.drizzle': Math.min(1, p('drizzle') * 1.3) * open,
    'bed.hail': Math.min(1, p('hail') * 1.8 + p('shard') * 0.6) * open,
    'bed.gale': smoothstep(0.45, 1, wind) * (1 - 0.4 * ownWind) * open,
    'bed.sandstorm': Math.min(1, (p('sand') + p('bone')) * 1.1) * open,
    'bed.blizzard': Math.min(1, (p('snow') + p('blacksnow')) * wind * 1.3) * open,
    'bed.embers': Math.min(1, (p('ember') + 1.2 * p('firefall')) * 1.3) * open,
    'bed.shimmer': Math.min(1, 1.4 * p('glitter') + p('shard') + 0.8 * look.glowPulse) * (0.5 + 0.5 * open),
    'bed.aurora': Math.min(1, Math.max(0, look.aurora)) * (ctx.layer === 1 ? open : 1),
    'bed.roof': ctx.layer === 1 && nearSurface ? Math.min(1, (wetFall + p('hail')) * 1.4) * (1 - exposure) : 0,
  }
  const out: Partial<Record<BedId, number>> = {}
  for (const [id, weight] of Object.entries(raw) as [BedId, number][]) {
    if (weight > 0.002) out[id] = weight * (WEATHER_BED_LEVEL[id] ?? 1)
  }
  return out
}

export class AmbienceController {
  private readonly beds = new Map<BedId, Bed>()
  private readonly buffers = new Map<BedId, AudioBuffer>()
  private readonly detailClock = new Map<NamedSoundId, number>()

  constructor(
    private readonly engine: AudioEngine,
    private readonly bank: SoundBank,
  ) {}

  /** Call a few times per second with the time since the last call. */
  update(ctx: AmbienceContext, dt: number): void {
    if (!this.engine.isRunning) return
    const targets = this.bedTargets(ctx)
    const t = this.engine.currentTime
    const all = new Set<BedId>([...this.beds.keys(), ...(Object.keys(targets) as BedId[])])
    for (const id of all) {
      const target = targets[id] ?? 0
      const bed = this.beds.get(id) ?? (target > 0 ? this.createBed(id) : null)
      if (!bed) continue
      bed.weight = target
      bed.gain.gain.setTargetAtTime(target * bed.calibration, t, BED_FADE)
      if (target > 0) {
        bed.silentFor = 0
        if (!bed.source && !bed.loading) void this.startBed(id, bed)
      } else if (bed.source) {
        // Stop beds that stayed silent for a while (they keep their buffer).
        bed.silentFor += dt
        if (bed.silentFor > 12) {
          bed.source.stop()
          bed.source = null
        }
      }
    }
    if (ctx.submergedIn === null) this.updateDetails(ctx, dt)
  }

  private bedTargets(ctx: AmbienceContext): Partial<Record<BedId, number>> {
    if (ctx.submergedIn === 'water' || ctx.submergedIn === 'swamp_water') return { 'bed.underwater': 1 }
    const targets = ctx.layer === 0 ? { ...(HELL_BEDS[ctx.biome] ?? { 'bed.hell': 1 }) } : this.surfaceTargets(ctx)
    for (const [id, weight] of Object.entries(weatherBedWeights(ctx)) as [BedId, number][]) targets[id] = (targets[id] ?? 0) + weight
    return targets
  }

  private surfaceTargets(ctx: AmbienceContext): Partial<Record<BedId, number>> {
    const open = ctx.outdoors
    // Wind grows with altitude above sea level (240) and with the weather's wind.
    const height = Math.max(0, Math.min(1, (ctx.cameraY - 250) / 120))
    const windFactor = ctx.weather ? Math.min(1.4, Math.max(0.7, 1 + (ctx.weather.windStrength - 0.15) * 1.2)) : 1
    // Nights are calmer: less wind, crickets in the grass (fading with altitude, hushed by rain)
    const night = ctx.night
    const rainHush = 1 - 0.75 * smoothstep(0.1, 0.4, ctx.weather?.look.wet ?? 0)
    const chorus = (NIGHT_CHORUS[ctx.biome] ?? 0.5) * (1 - 0.8 * height) * rainHush
    const targets: Partial<Record<BedId, number>> = {
      'bed.wind': open * (0.45 + 0.55 * height) * (1 - 0.3 * night) * windFactor,
      'bed.night': open * night * chorus,
      'bed.cave': (1 - open) * (ctx.cameraY < 236 ? 0.9 : 0.4),
    }
    // The water: surf from the open sea, a river babbling by, the hull lapping under a boat
    const water = ctx.water
    if (water) {
      const low = 1 - Math.max(0, Math.min(1, (ctx.cameraY - 246) / 40))
      if (water.sea > 0.01) targets['bed.surf'] = water.sea * open * low * 0.85
      if (water.river > 0.01) targets['bed.stream'] = water.river * open * low * 0.7
      if (water.boat > 0.01) targets['bed.lapping'] = water.boat * 0.8
    }
    const caveBeds = ctx.caveBiome ? CAVE_BEDS[ctx.caveBiome] : undefined
    if (caveBeds) {
      for (const [id, weight] of Object.entries(caveBeds) as [BedId, number][]) targets[id] = weight * (1 - open)
    }
    return targets
  }

  private updateDetails(ctx: AmbienceContext, dt: number): void {
    const rules: DetailRule[] = []
    if (ctx.layer === 0) {
      rules.push(...(HELL_DETAILS[ctx.biome] ?? []))
    } else if (ctx.outdoors > 0.6) {
      // Birds sing by day, owls call at night; swamp frogs are loudest after dark.
      // Rain and gales silence the birds and owls and hush the frogs
      const wet = ctx.weather?.look.wet ?? 0
      const calm = wet < 0.3 && (ctx.weather?.windStrength ?? 0) < 0.8
      if (calm && VEGETATED.has(ctx.biome) && ctx.cameraY < 330 && ctx.night < 0.4) rules.push({ id: 'amb.bird', every: 16 })
      if (calm && OWL_BIOMES.has(ctx.biome) && ctx.cameraY < 330 && ctx.night > 0.6) rules.push({ id: 'amb.owl', every: 38 })
      if (ctx.biome === 'swamp') rules.push({ id: 'amb.frog', every: (ctx.night > 0.5 ? 6 : 11) * (1 + 2 * Math.min(1, wet)) })
    } else if (ctx.caveBiome && ctx.outdoors < 0.4) {
      rules.push(...(CAVE_DETAILS[ctx.caveBiome] ?? []))
    } else if (ctx.outdoors < 0.25 && ctx.cameraY < 236) {
      rules.push({ id: 'amb.drip', every: 8 }, { id: 'amb.distantrumble', every: 60 })
    }
    for (const rule of rules) {
      // Poisson arrivals: chance dt/every per update.
      const elapsed = (this.detailClock.get(rule.id) ?? 0) + dt
      this.detailClock.set(rule.id, elapsed)
      if (elapsed < rule.every * 0.3) continue
      if (Math.random() < dt / rule.every) {
        this.detailClock.set(rule.id, 0)
        this.bank.play(rule.id, this.randomNearbyPosition())
      }
    }
  }

  private randomNearbyPosition(): { x: number; y: number; z: number } {
    const listener = this.bank.getListenerPosition()
    const angle = Math.random() * Math.PI * 2
    const distance = 6 + Math.random() * 14
    return {
      x: listener.x + Math.cos(angle) * distance,
      y: listener.y + (Math.random() - 0.3) * 6,
      z: listener.z + Math.sin(angle) * distance,
    }
  }

  private createBed(id: BedId): Bed {
    const gain = this.engine.context.createGain()
    gain.gain.value = 0
    gain.connect(this.engine.input('ambience'))
    const bed: Bed = { gain, source: null, loading: false, calibration: 0, weight: 0, silentFor: 0 }
    this.beds.set(id, bed)
    return bed
  }

  private async startBed(id: BedId, bed: Bed): Promise<void> {
    bed.loading = true
    try {
      let buffer = this.buffers.get(id)
      if (!buffer) {
        const raw = await this.bank.renderRaw(id, 7, BED_SAMPLE_RATE, RenderPriority.NORMAL)
        buffer = raw.buffer
        this.buffers.set(id, buffer)
        bed.calibration = Math.pow(10, (BED_LOUDNESS - raw.loudnessDb) / 20)
      }
      const source = this.engine.context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(bed.gain)
      // Random offset so a bed heard again doesn't restart from the same gust.
      source.start(this.engine.currentTime, Math.random() * buffer.duration)
      bed.source = source
      bed.gain.gain.setTargetAtTime(bed.weight * bed.calibration, this.engine.currentTime, BED_FADE)
    } catch (error) {
      console.warn(`[Audio] ambience bed ${id} failed:`, error)
    } finally {
      bed.loading = false
    }
  }
}
