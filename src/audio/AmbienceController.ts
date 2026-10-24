/**
 * Background ambience: looping noise beds crossfaded by environment (surface
 * wind, cave hollowness, each Hell biome's air, underwater), plus sparse
 * one-shot details placed around the listener (birds, drips, lava pops, ice
 * creaks...). Beds render lazily the first time an environment needs them.
 */

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

export type BedId = 'bed.wind' | 'bed.night' | 'bed.cave' | 'bed.hell' | 'bed.ossuary' | 'bed.embergrove' | 'bed.crystal' | 'bed.cocytus' | 'bed.underwater'

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
    if (ctx.layer === 0) return HELL_BEDS[ctx.biome] ?? { 'bed.hell': 1 }
    const open = ctx.outdoors
    // Wind grows with altitude above sea level (240).
    const height = Math.max(0, Math.min(1, (ctx.cameraY - 250) / 120))
    // Nights are calmer: less wind, crickets in the grass (fading with altitude)
    const night = ctx.night
    const chorus = (NIGHT_CHORUS[ctx.biome] ?? 0.5) * (1 - 0.8 * height)
    const targets: Partial<Record<BedId, number>> = {
      'bed.wind': open * (0.45 + 0.55 * height) * (1 - 0.3 * night),
      'bed.night': open * night * chorus,
      'bed.cave': (1 - open) * (ctx.cameraY < 236 ? 0.9 : 0.4),
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
      // Birds sing by day, owls call at night; swamp frogs are loudest after dark
      if (VEGETATED.has(ctx.biome) && ctx.cameraY < 330 && ctx.night < 0.4) rules.push({ id: 'amb.bird', every: 16 })
      if (OWL_BIOMES.has(ctx.biome) && ctx.cameraY < 330 && ctx.night > 0.6) rules.push({ id: 'amb.owl', every: 38 })
      if (ctx.biome === 'swamp') rules.push({ id: 'amb.frog', every: ctx.night > 0.5 ? 6 : 11 })
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
