import { CYCLE_SECONDS, hourAt, sunElevationAt } from '../daynight/WorldClock.ts'
import { biomeWeatherOf, getWeatherDef, resolveAtHeight, WeatherCascade, type PresentContext } from './WeatherCatalog.ts'
import { addLook, clearLook, copyLook, createWeatherLook, easeLook, finishLook, type WeatherLook } from './WeatherLook.ts'
import { copyAir, createAir, SystemList, type WeatherAir, type WeatherSystems } from './WeatherSystems.ts'

/**
 * The weather where the player is: the air of the weather systems around it
 * (WeatherSystems.ts) read through the biomes there (WeatherCatalog.ts),
 * overrides applied (the debug weather button, a rung Sky Bell), blended into
 * one look and eased so nothing snaps, plus the weather's name with a little
 * hysteresis. One instance, updated by setupWeather's 'weather' task; the
 * renderers, sky map, sound and gameplay read it.
 *
 * Two clocks: weather time (`time`: world time plus the offset sleeping adds,
 * what the systems run on) and the game clock (`clock`: world time, which
 * says whether it is night and which night it is).
 */

/** A Sky Bell's spell: rain or a clear sky around where it was rung, for a while. */
export interface WeatherSpell {
  readonly mode: 'rain' | 'clear'
  readonly x: number
  readonly z: number
  /** Weather time the spell ends. */
  readonly until: number
}

/** A spell holds within this radius of its bell (blocks), fading over the last SPELL_EDGE. */
export const SPELL_RADIUS = 384
const SPELL_EDGE = 128
/** A spell eases in and out over this long (seconds of weather time). */
const SPELL_FADE = 20

/** Ease time constant (seconds): softens changes of place, layer or override. */
const EASE = 4
/** The mix around the player is recomputed this often (seconds); the look eases every frame. */
const MIX_INTERVAL = 0.25
/** A new weather must hold this long before it is announced (seconds), and outweigh the current one by this much. */
const NAME_HOLD = 8
const NAME_MARGIN = 0.2
/** How biome borders blend: around the player 9 readings within 64 blocks; for the sky map 5 within 110. */
const BLEND_RADIUS = 64
const WIDE_RADIUS = 110

/** How many biomes a reading blends: one ('none'), the player's view, or wide (the sky map's cells). */
export type BiomeBlend = 'none' | 'view' | 'wide'
/** Systems are collected this far around the player (the sky map's reach and then some), again after this long or this far. */
export const COLLECT_RADIUS = 3500
const COLLECT_SECONDS = 1
const COLLECT_MOVE = 300

export interface WeatherStateDeps {
  /** The surface's weather systems and the Hell cavern's (its own air). */
  readonly surface: WeatherSystems
  readonly cavern: WeatherSystems
  /** Biome id at a world position on a layer (0 Hell, 1 surface). */
  biomeAt(x: number, z: number, layer: 0 | 1): string
}

/** A place and time to read the weather at. */
interface SampleTime {
  /** Weather time (the systems). */
  t: number
  /** Game clock (world time: night or day, which night). */
  clock: number
}

/** Game day a clock reading belongs to (a night belongs to the day it began on). */
function dayAt(clock: number): number {
  return Math.floor(clock / CYCLE_SECONDS) + 1
}

/** What a biome needs to read the air (one reused object). */
class Context implements PresentContext {
  night = false
  private systems: WeatherSystems | null = null
  private x = 0
  private z = 0
  private t = 0
  private day = 1

  set(systems: WeatherSystems, x: number, z: number, at: SampleTime): this {
    this.systems = systems
    this.x = x
    this.z = z
    this.t = at.t
    this.day = dayAt(at.clock)
    this.night = sunElevationAt(hourAt(at.clock)) < -0.02
    return this
  }

  regional(salt: number): number {
    return this.systems ? this.systems.regional(this.x, this.z, this.t, salt) : 0
  }

  nightEvent(salt: number, chance: number): number {
    return this.systems ? this.systems.nightEvent(this.day, salt, chance) : 0
  }
}

export class WeatherState {
  /** The live look at the player (eased). */
  readonly look: WeatherLook = createWeatherLook()
  /** The air at the player (not eased). */
  readonly air: WeatherAir = createAir()
  /** The weather's id at the player (hysteresis: changes after NAME_HOLD seconds). */
  weatherId = 'clear'
  /** Layer the player is on (0 Hell, 1 surface). */
  layer: 0 | 1 = 1
  /** 0-1: a rainbow after a daytime shower (the look's own rainbow is a sun shower's). */
  afterRainbow = 0
  /** 0-1: how wet the open ground is (rises in rain, dries afterwards). */
  wetness = 0
  /** Wind direction (unit vector) and strength 0-1 (the look's wind with gusts). */
  windX = 1
  windZ = 0
  windStrength = 0.15
  /** Weather time and game clock of the last update. */
  time = 0
  clock = 0
  /** A forced weather id (debug button), everywhere; null = the real weather. */
  forced: string | null = null
  spell: WeatherSpell | null = null

  private readonly target = createWeatherLook()
  private readonly mix = new Map<string, number>()
  private readonly cascade = new WeatherCascade()
  private readonly context = new Context()
  private readonly sampleAir = createAir()
  private readonly lists = { surface: new SystemList(), cavern: new SystemList() }
  /** For a place beyond the player's systems (rare). */
  private readonly farList = new SystemList()
  private readonly now: SampleTime = { t: 0, clock: 0 }
  private readonly warped = { x: 0, z: 0 }
  private pendingId = 'clear'
  private pendingFor = 0
  private sinceWet = Infinity
  private rainbowHold = 0
  private initialized = false
  private sinceMix = Infinity

  constructor(private readonly deps: WeatherStateDeps) {}

  private systemsOf(layer: 0 | 1): WeatherSystems {
    return layer === 1 ? this.deps.surface : this.deps.cavern
  }

  /** Keep the systems around the player collected (again after COLLECT_SECONDS or COLLECT_MOVE blocks). */
  private refreshList(layer: 0 | 1, x: number, z: number): void {
    const list = layer === 1 ? this.lists.surface : this.lists.cavern
    if (!list.covers(x, z, this.now.t, COLLECT_RADIUS - COLLECT_MOVE, COLLECT_SECONDS)) {
      this.systemsOf(layer).collect(this.now.t, x, z, COLLECT_RADIUS, list)
    }
  }

  /** The systems for a place now: the player's list if it reaches, else a small list of its own. */
  private listAt(layer: 0 | 1, x: number, z: number): SystemList {
    const list = layer === 1 ? this.lists.surface : this.lists.cavern
    if (list.covers(x, z, this.now.t, 0, COLLECT_SECONDS * 2)) return list
    if (this.farList.covers(x, z, this.now.t, 0, COLLECT_SECONDS * 2)) return this.farList
    return this.systemsOf(layer).collect(this.now.t, x, z, 256, this.farList)
  }

  /**
   * The air at a place: the systems' (at `at`, else now), with a rung Sky
   * Bell's spell. `list` overrides the cached systems (forecasts).
   */
  airAt(x: number, z: number, layer: 0 | 1, out: WeatherAir, at: SampleTime = this.now, list?: SystemList): WeatherAir {
    const systems = this.systemsOf(layer)
    systems.airAt(list ?? this.listAt(layer, x, z), x, z, out)
    this.applySpell(x, z, layer, at.t, out)
    return out
  }

  /**
   * The weather mix (id → weight, weights summing to 1) at a place, overrides
   * included, now (or at `at` with that time's systems), as the biomes there
   * read the air (`blend`: see BiomeBlend; biome readings are shifted by
   * WeatherSystems.biomeWarp, so looks change along meandering lines). The
   * air it was read from is left in `air` (if given).
   */
  mixAt(
    x: number, y: number, z: number, layer: 0 | 1, blend: BiomeBlend, out: Map<string, number>,
    air: WeatherAir = this.sampleAir, at: SampleTime = this.now, list?: SystemList,
  ): Map<string, number> {
    out.clear()
    if (this.forced) {
      out.set(this.forced, 1)
      return out
    }
    const systems = this.systemsOf(layer)
    this.airAt(x, z, layer, air, at, list)
    const ctx = this.context.set(systems, x, z, at)
    const ring = blend === 'view' ? 8 : blend === 'wide' ? 4 : 0
    const radius = blend === 'view' ? BLEND_RADIUS : WIDE_RADIUS
    const centreWeight = ring === 0 ? 1 : 2 / (ring + 2)
    const w = systems.biomeWarp(x, z, this.warped)
    for (let p = 0; p <= ring; p++) {
      const centre = p === ring
      const angle = (p / Math.max(1, ring)) * Math.PI * 2
      const r = centre ? 0 : radius
      const biome = biomeWeatherOf(this.deps.biomeAt(w.x + Math.cos(angle) * r, w.z + Math.sin(angle) * r, layer))
      biome.present(air, ctx, this.cascade.begin(out, centre ? centreWeight : 1 / (ring + 2)))
    }
    // Snow falls as rain below the pine forest's snow line
    for (const [id, w] of out) {
      const resolved = resolveAtHeight(id, y)
      if (resolved !== id) {
        out.delete(id)
        out.set(resolved, (out.get(resolved) ?? 0) + w)
      }
    }
    return out
  }

  /** Raise or clear the air around a rung Sky Bell. */
  private applySpell(x: number, z: number, layer: 0 | 1, t: number, air: WeatherAir): void {
    const spell = this.spell
    if (!spell || layer !== 1) return
    const left = spell.until - t
    if (left <= 0) return
    const d = Math.hypot(x - spell.x, z - spell.z)
    const strength = (1 - Math.min(1, Math.max(0, (d - (SPELL_RADIUS - SPELL_EDGE)) / SPELL_EDGE))) * Math.min(1, left / SPELL_FADE)
    if (strength <= 0) return
    if (spell.mode === 'rain') {
      air.cloud += (1 - air.cloud) * strength
      air.precip += (0.9 - Math.min(0.9, air.precip)) * strength
    } else {
      const keep = 1 - strength
      air.cloud *= keep
      air.precip *= keep
      air.storm *= keep
      air.fog *= keep
      air.wind = Math.min(air.wind, 0.15 + (air.wind - 0.15) * keep)
    }
  }

  /**
   * The blended look of a mix, with what the air itself adds: a cloudier sky
   * under fair-weather cloud, the wind blowing as hard as the air does (when
   * `air` is given and nothing is forced).
   */
  lookOf(mix: Map<string, number>, out: WeatherLook, air?: WeatherAir, layer: 0 | 1 = 1): WeatherLook {
    clearLook(out)
    for (const [id, w] of mix) addLook(out, getWeatherDef(id).look, w)
    finishLook(out, 1)
    if (air && !this.forced) {
      if (layer === 1) out.cloud = Math.max(out.cloud, air.cloud * 0.6 - 0.05)
      out.wind = Math.max(out.wind, air.wind * 0.85)
    }
    return out
  }

  /** The heaviest weather in a mix. */
  dominantOf(mix: Map<string, number>): string {
    let best = 'clear'
    let weight = -1
    for (const [id, w] of mix) {
      if (w > weight) {
        best = id
        weight = w
      }
    }
    return best
  }

  /** Jump straight to the weather as it is, without easing (debug forcing, a jump in time or place). */
  snap(): void {
    this.initialized = false
    this.sinceMix = Infinity
  }

  /** The weather that will be at a place after `seconds` (the Storm Glass's forecast). */
  forecast(x: number, y: number, z: number, seconds: number): string {
    const at = { t: this.time + seconds, clock: this.clock + seconds }
    const list = this.systemsOf(this.layer).collect(at.t, x, z, 64, new SystemList())
    return this.dominantOf(this.mixAt(x, y, z, this.layer, 'view', new Map(), createAir(), at, list))
  }

  /**
   * Move the weather on. Call every frame.
   * @param t weather time, @param clock game clock (world time)
   * @param exposure 0 sheltered .. 1 under open sky (for wetness)
   * @param sunUp 0 night .. 1 day (rainbows need the sun)
   */
  update(dt: number, t: number, clock: number, x: number, y: number, z: number, layer: 0 | 1, exposure: number, sunUp: number): void {
    this.time = t
    this.clock = clock
    this.now.t = t
    this.now.clock = clock
    this.layer = layer
    if (this.spell && this.spell.until <= t) this.spell = null
    this.refreshList(layer, x, z)
    const mix = this.mix
    this.sinceMix += dt
    if (this.sinceMix >= MIX_INTERVAL || !this.initialized) {
      this.sinceMix = 0
      this.mixAt(x, y, z, layer, 'view', mix, this.sampleAir)
      copyAir(this.air, this.sampleAir)
      this.lookOf(mix, this.target, this.air, layer)
    }
    if (!this.initialized) {
      // Load into the weather as it is, not a fade in from clear
      this.initialized = true
      copyLook(this.look, this.target)
      this.weatherId = this.pendingId = this.dominantOf(mix)
    } else {
      easeLook(this.look, this.target, Math.min(1, dt / EASE))
    }
    const look = this.look

    // Wind: the look's strength with gusts, along the steering wind
    const systems = this.systemsOf(layer)
    const angle = systems.windAngle(x, z, t)
    this.windX = Math.cos(angle)
    this.windZ = Math.sin(angle)
    this.windStrength = Math.min(1, look.wind * systems.gust(t))

    // Name it, once the change has held for a moment (a little sticky: rain bands and ragged edges don't flicker the name)
    let named = this.dominantOf(mix)
    if (named !== this.weatherId && (mix.get(named) ?? 0) < (mix.get(this.weatherId) ?? 0) + NAME_MARGIN) named = this.weatherId
    if (named === this.weatherId) {
      this.pendingFor = 0
    } else if (named === this.pendingId) {
      this.pendingFor += dt
      if (this.pendingFor >= NAME_HOLD) this.weatherId = named
    } else {
      this.pendingId = named
      this.pendingFor = 0
    }

    // Open ground gets wet in rain (about half a minute) and dries in a few minutes
    const raining = look.wet * exposure
    if (raining > 0.05) this.wetness = Math.min(1, this.wetness + raining * dt / 30)
    else this.wetness = Math.max(0, this.wetness - dt * (0.004 + 0.006 * sunUp * (1 - Math.max(0, look.cloud))))

    // Rainbow: the sun comes out within a minute of a real shower
    if (look.wet > 0.4) this.sinceWet = 0
    else this.sinceWet += dt
    const showery = layer === 1 && this.sinceWet < 60 && look.wet < 0.08 && look.cloud < 0.75 && sunUp > 0.5
    if (showery) this.rainbowHold = 45
    else this.rainbowHold = Math.max(0, this.rainbowHold - dt)
    const want = this.rainbowHold > 0 && look.wet < 0.08 ? 1 : 0
    this.afterRainbow += (want - this.afterRainbow) * Math.min(1, dt / 8)
  }
}
