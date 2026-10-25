import { SimplexNoise } from '../world/generate/SimplexNoise.ts'
import { CYCLE_SECONDS } from '../daynight/WorldClock.ts'

/**
 * Weather systems: the air everywhere is a handful of numbers (WeatherAir) -
 * cloud cover, precipitation, storminess, wind and fog - and those numbers
 * come from weather systems: rain belts, thunderstorms, squall lines, wind
 * storms, fog banks, overcast decks and fields of fair-weather cloud. Each is
 * born somewhere, grows, drifts across the world with the steering wind (a
 * few at their own pace: squall lines race ahead, fog banks lag), and dies
 * out; between them the air is clear, which is most of the time. Their shapes
 * are their own - warped, banded blobs and long lines that know nothing of
 * biomes. Biomes only decide what the air looks like on their ground
 * (WeatherCatalog: the same rain belt is a rain shower on the plains,
 * snowfall in the snowy pines and a cloudburst over the desert).
 *
 * A pure function of position and weather time (nothing saved): systems sit
 * on a space-time lattice in a frame that drifts with the steering wind -
 * CELL-wide cells and EPOCH-long steps, each with SLOTS chances of a system.
 * Sampling first collects the systems alive near a place (collect), then
 * reads the air from that list (airAt) as often as needed.
 *
 * Weather time = world time (worldTime) plus an offset that sleeping adds to
 * (setupWeather), so a night in bed wakes to new weather.
 */

/** Seconds since day 1's 06:00 for a clock reading. */
export function worldTime(day: number, cycleTime: number): number {
  return (day - 1) * CYCLE_SECONDS + cycleTime
}

/** The air at a place: what biomes turn into weather. All 0-1. */
export interface WeatherAir {
  /** Cloud cover (0 = the biome's fair-weather sky, 1 = a solid deck). */
  cloud: number
  /** Precipitation (rain, snow, sand-dry virga...: what falls). */
  precip: number
  /** Storminess: lightning, hail, cloudbursts. */
  storm: number
  /** Wind (about 0.15 is a breeze, 1 a full gale). */
  wind: number
  /** Low cloud lying on the ground: mist and fog. */
  fog: number
  /** A system's character (0-1), for biomes to pick variants by (hail or thunder). */
  flavor: number
}

export function createAir(): WeatherAir {
  return { cloud: 0, precip: 0, storm: 0, wind: BREEZE, fog: 0, flavor: 0.5 }
}

export function copyAir(out: WeatherAir, src: WeatherAir): WeatherAir {
  out.cloud = src.cloud
  out.precip = src.precip
  out.storm = src.storm
  out.wind = src.wind
  out.fog = src.fog
  out.flavor = src.flavor
  return out
}

type Range = readonly [number, number]

/** A kind of weather system: how big, how long, what it carries. */
interface SystemType {
  readonly id: string
  /** Relative share of systems. */
  readonly share: number
  /** Mean radius (blocks) and length/width ratio. */
  readonly radius: Range
  readonly aspect: Range
  /** Lifetime (seconds of weather time). */
  readonly life: Range
  readonly cloud: Range
  readonly precip: Range
  readonly storm: Range
  readonly wind: Range
  readonly fog: Range
  /** Speed relative to the steering wind (blocks/s): squall lines race ahead, fog banks lag. */
  readonly speed: Range
  /** Lies across its motion (squall lines); else any orientation. */
  readonly across?: boolean
  /** How far the cloud deck reaches beyond the core (thunderstorm anvils). */
  readonly cloudReach: number
  /** Storminess is skewed toward calm (most rain belts are just rain): value = min + (max - min)·u^skew. */
  readonly stormSkew?: number
}

const SYSTEM_TYPES: readonly SystemType[] = [
  // Fair-weather cumulus: a cloudier sky, nothing more
  { id: 'fair', share: 20, radius: [700, 1100], aspect: [1, 1.8], life: [1800, 3000], cloud: [0.4, 0.65], precip: [0, 0], storm: [0, 0], wind: [0.15, 0.3], fog: [0, 0], speed: [0, 0.2], cloudReach: 1 },
  // A stratus deck, a little drizzle at most
  { id: 'overcast', share: 13, radius: [700, 1100], aspect: [1.2, 2.2], life: [1800, 3000], cloud: [0.85, 1], precip: [0, 0.16], storm: [0, 0], wind: [0.15, 0.3], fog: [0, 0.25], speed: [-0.2, 0.1], cloudReach: 1.1 },
  // A rain belt (some with thunder in their cores)
  { id: 'rain', share: 24, radius: [700, 1050], aspect: [1.2, 2.2], life: [1800, 3000], cloud: [1, 1], precip: [0.42, 0.75], storm: [0, 0.68], stormSkew: 2.2, wind: [0.25, 0.45], fog: [0, 0.15], speed: [-0.2, 0.15], cloudReach: 1.2 },
  // A thunderstorm: an intense core under a wide anvil
  { id: 'thunder', share: 12, radius: [550, 800], aspect: [1, 1.4], life: [1500, 2400], cloud: [1, 1], precip: [0.75, 1], storm: [0.7, 1], wind: [0.55, 0.8], fog: [0, 0], speed: [0.1, 0.4], cloudReach: 1.45 },
  // A squall line: a long, fast band of wind and rain across the motion
  { id: 'squall', share: 6, radius: [650, 850], aspect: [2.2, 3.2], life: [1200, 1800], cloud: [1, 1], precip: [0.45, 0.7], storm: [0.35, 0.6], wind: [0.85, 1], fog: [0, 0], speed: [0.5, 0.8], across: true, cloudReach: 1.3 },
  // A dry wind storm (a sandstorm over the desert, a gale elsewhere)
  { id: 'wind', share: 12, radius: [750, 1100], aspect: [1.3, 2.2], life: [1800, 2700], cloud: [0.2, 0.45], precip: [0, 0], storm: [0, 0], wind: [0.78, 1], fog: [0, 0], speed: [0.1, 0.4], cloudReach: 1 },
  // A fog bank, slow and still
  { id: 'fog', share: 17, radius: [600, 950], aspect: [1.2, 2.2], life: [1500, 2700], cloud: [0.3, 0.5], precip: [0, 0], storm: [0, 0], wind: [0, 0.05], fog: [0.65, 1], speed: [-0.7, -0.4], cloudReach: 1 },
]
const SHARE_TOTAL = SYSTEM_TYPES.reduce((sum, type) => sum + type.share, 0)

/** Lattice cell size in the drifting frame (blocks), time step (seconds), system slots per cell and step, and each slot's chance. */
const CELL = 2000
const EPOCH = 1200
const SLOTS = 3
const SLOT_CHANCE = 0.34
/** Shapes are warped by this much (in units of the system's size), so no system is an ellipse. */
const WARP = 0.32
/** How fast the steering wind carries the weather (blocks/s). */
const STEER_SPEED = 0.85
/** Drift is integrated in steps of this many seconds (cached). */
const DRIFT_STEP = 30
/** The breeze between systems. */
const BREEZE = 0.14
/** How far biome readings are shifted (biomeWarp, blocks). */
const BIOME_WARP = 140

const LIFE_MAX = Math.max(...SYSTEM_TYPES.map((type) => type.life[1]))
/** The farthest any part of a system reaches from its lattice point: its shape plus how far it travels on its own. */
const REACH_MAX = Math.max(
  ...SYSTEM_TYPES.map((type) => type.radius[1] * Math.sqrt(type.aspect[1]) * type.cloudReach * (1 + WARP) + Math.max(Math.abs(type.speed[0]), Math.abs(type.speed[1])) * type.life[1] * 0.5)
)

/** A system alive at the collected time, ready to sample. */
export interface ActiveSystem {
  type: string
  /** Centre now (world blocks). */
  cx: number
  cz: number
  /** Long axis direction. */
  cos: number
  sin: number
  /** 1 / semi-axes (blocks), with growth. */
  invA: number
  invB: number
  /** Distance beyond which it has no effect (blocks). */
  reach: number
  /** Life envelope 0-1 (grows, holds, dies out). */
  strength: number
  cloud: number
  precip: number
  storm: number
  wind: number
  fog: number
  flavor: number
  cloudReach: number
  /** Noise offsets of its shape and rain bands. */
  seedA: number
  seedB: number
}

function createActive(): ActiveSystem {
  return {
    type: '', cx: 0, cz: 0, cos: 1, sin: 0, invA: 1, invB: 1, reach: 0, strength: 0, cloud: 0, precip: 0, storm: 0, wind: 0,
    fog: 0, flavor: 0.5, cloudReach: 1, seedA: 0, seedB: 0,
  }
}

/** A list of the systems alive around a place at one time (WeatherSystems.collect fills it). */
export class SystemList {
  readonly systems: ActiveSystem[] = []
  count = 0
  /** Weather time, centre and radius it was collected for. */
  time = -Infinity
  x = 0
  z = 0
  radius = 0

  /** Whether this list still serves a place and time (within `slack` seconds and the radius margin). */
  covers(x: number, z: number, t: number, radius: number, slack: number): boolean {
    return Math.abs(t - this.time) <= slack && Math.hypot(x - this.x, z - this.z) + radius <= this.radius
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function lerp(range: Range, u: number): number {
  return range[0] + (range[1] - range[0]) * u
}

export class WeatherSystems {
  private readonly noise: SimplexNoise
  private readonly seed: number
  private readonly driftAngle0: number
  /** Drift offset at t = i * DRIFT_STEP (x, z interleaved). */
  private driftPrefix = new Float64Array(2 * 256)
  private driftCount = 1
  private readonly offset = { x: 0, z: 0 }
  private readonly midOffset = { x: 0, z: 0 }

  constructor(seed: number) {
    this.seed = seed | 0
    this.noise = new SimplexNoise((seed ^ 0x5eed7a1) | 0)
    this.driftAngle0 = (this.hash(17, 29, 31) / 4294967296) * Math.PI * 2
  }

  /** Direction the steering wind carries the weather at time t (radians): turns slowly over the days. */
  driftAngle(t: number): number {
    return this.driftAngle0 + this.noise.noise2D(t / (CYCLE_SECONDS * 1.7), 41.3) * 1.6
  }

  /** Wind direction at a place and time (radians): along the drift, wavering. */
  windAngle(x: number, z: number, t: number): number {
    return this.driftAngle(t) + this.noise.noise2D(t / 240 + x / 3000, z / 3000 - 9.1) * 0.6
  }

  /** Gustiness at a time: 0.7-1.0. */
  gust(t: number): number {
    return 0.85 + 0.15 * this.noise.noise2D(t / 20, 3.7)
  }

  /**
   * Collect the systems alive at time t that reach within `radius` of (x, z).
   * Returns the list (reused).
   */
  collect(t: number, x: number, z: number, radius: number, list: SystemList): SystemList {
    list.count = 0
    list.time = t
    list.x = x
    list.z = z
    list.radius = radius
    this.drift(t, this.offset)
    const u = x - this.offset.x
    const v = z - this.offset.z
    const span = Math.ceil((radius + REACH_MAX) / CELL)
    const ci = Math.floor(u / CELL)
    const cj = Math.floor(v / CELL)
    const kLast = Math.floor(t / EPOCH)
    const kFirst = Math.floor((t - LIFE_MAX) / EPOCH) - 1
    for (let k = kFirst; k <= kLast; k++) {
      for (let j = cj - span; j <= cj + span; j++) {
        for (let i = ci - span; i <= ci + span; i++) {
          for (let s = 0; s < SLOTS; s++) this.trySystem(i, j, k, s, t, x, z, radius, list)
        }
      }
    }
    return list
  }

  private trySystem(i: number, j: number, k: number, slot: number, t: number, x: number, z: number, radius: number, list: SystemList): void {
    const h = this.hash(i * SLOTS + slot, j, k)
    if (h / 4294967296 >= SLOT_CHANCE) return
    // A small generator for the rest of its numbers
    let state = this.hash(h, k, 0x51ed) | 0
    const next = (): number => {
      state = (state + 0x6d2b79f5) | 0
      let r = Math.imul(state ^ (state >>> 15), 1 | state)
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
    const birth = (k + next()) * EPOCH
    let pick = next() * SHARE_TOTAL
    let type = SYSTEM_TYPES[SYSTEM_TYPES.length - 1]
    for (const candidate of SYSTEM_TYPES) {
      pick -= candidate.share
      if (pick < 0) {
        type = candidate
        break
      }
    }
    const life = lerp(type.life, next())
    const age = (t - birth) / life
    if (age <= 0 || age >= 1) return

    // Where it is now: its lattice point carried by the drift, plus its own motion around mid-life
    const mid = birth + life * 0.5
    const heading = this.driftAngle(mid)
    const speed = lerp(type.speed, next())
    const fx = (i + 0.15 + 0.7 * next()) * CELL
    const fz = (j + 0.15 + 0.7 * next()) * CELL
    const cx = fx + this.offset.x + Math.cos(heading) * speed * (t - mid)
    const cz = fz + this.offset.z + Math.sin(heading) * speed * (t - mid)

    const meanRadius = lerp(type.radius, next())
    const aspect = lerp(type.aspect, next())
    const growth = 0.75 + 0.25 * smoothstep(0, 0.4, age)
    const a = meanRadius * Math.sqrt(aspect) * growth
    const b = (meanRadius / Math.sqrt(aspect)) * growth
    const reach = a * type.cloudReach * (1 + WARP)
    const orient = type.across ? heading + Math.PI / 2 : next() * Math.PI
    const strength = smoothstep(0, 0.15, age) * (1 - smoothstep(0.78, 1, age))
    if (Math.hypot(cx - x, cz - z) > radius + reach || strength <= 0) return

    const sys = list.systems[list.count] ?? (list.systems[list.count] = createActive())
    list.count++
    sys.type = type.id
    sys.cx = cx
    sys.cz = cz
    sys.cos = Math.cos(orient)
    sys.sin = Math.sin(orient)
    sys.invA = 1 / a
    sys.invB = 1 / b
    sys.reach = reach
    sys.strength = strength
    sys.cloud = lerp(type.cloud, next())
    sys.precip = lerp(type.precip, next())
    sys.storm = type.storm[0] + (type.storm[1] - type.storm[0]) * Math.pow(next(), type.stormSkew ?? 1)
    sys.wind = lerp(type.wind, next())
    sys.fog = lerp(type.fog, next())
    sys.flavor = next()
    sys.cloudReach = type.cloudReach
    sys.seedA = next() * 512 - 256
    sys.seedB = next() * 512 - 256
  }

  /** The air at (x, z) from a collected list (t = the list's time, for the rain bands' slow churn). */
  airAt(list: SystemList, x: number, z: number, out: WeatherAir): WeatherAir {
    const t = list.time
    const noise = this.noise
    let cloudKeep = 1
    let precipKeep = 1
    let fogKeep = 1
    let storm = 0
    let wind = 0
    let flavorSum = 0
    let flavorWeight = 0
    for (let n = 0; n < list.count; n++) {
      const s = list.systems[n]
      const dx = x - s.cx
      const dz = z - s.cz
      if (dx * dx + dz * dz > s.reach * s.reach) continue
      const lx = (dx * s.cos + dz * s.sin) * s.invA
      const lz = (dz * s.cos - dx * s.sin) * s.invB
      // Warp the ellipse into a blob of its own
      const qx = lx + noise.noise2D(lx * 0.8 + s.seedA, lz * 0.8 + s.seedB) * WARP
      const qz = lz + noise.noise2D(lx * 0.8 + s.seedB + 17.3, lz * 0.8 + s.seedA - 5.1) * WARP
      const r = Math.sqrt(qx * qx + qz * qz)
      const c = s.cloud * (1 - smoothstep(0.65, 1, r / s.cloudReach)) * s.strength
      if (c <= 0 && r > 1.05) continue
      cloudKeep *= 1 - c
      if (r < 1.05) {
        // Rain comes in bands and cells that move through the system
        const band = s.precip > 0 || s.storm > 0
          ? Math.min(1, Math.max(0, 0.55 + 0.65 * noise.noise2D(qx * 2.4 + s.seedA * 0.37, qz * 2.4 + t * 0.0004)))
          : 1
        // Broad, steady cores with soft edges: a system's weather holds for most of its passing
        const p = s.precip * (1 - smoothstep(0.6, 0.9, r)) * (0.72 + 0.28 * band) * s.strength
        const st = s.storm * (1 - smoothstep(0.45, 0.8, r)) * (0.85 + 0.15 * band) * s.strength
        precipKeep *= 1 - p
        fogKeep *= 1 - s.fog * (1 - smoothstep(0.55, 0.95, r)) * s.strength
        storm = Math.max(storm, st)
        wind = Math.max(wind, s.wind * (1 - smoothstep(0.6, 1, r)) * s.strength)
        if (p + st > 0.01) {
          flavorSum += s.flavor * (p + st)
          flavorWeight += p + st
        }
      }
    }
    out.cloud = 1 - cloudKeep
    out.precip = 1 - precipKeep
    out.storm = storm
    out.fog = 1 - fogKeep
    const breeze = BREEZE + 0.06 * noise.noise2D(t / 400, 7.7)
    // Fog lies in still air
    out.wind = Math.max(breeze * (1 - out.fog * 0.8), wind)
    out.flavor = flavorWeight > 0 ? flavorSum / flavorWeight : 0.5
    return out
  }

  /**
   * A patch of some fair-weather special (pollen, heat waves, swamp gas...)
   * here, 0-1: slow, drifting regions about a fifth of the land, a
   * different map for each salt.
   */
  regional(x: number, z: number, t: number, salt: number): number {
    this.drift(t, this.midOffset)
    const u = (x - this.midOffset.x) / 1700
    const v = (z - this.midOffset.z) / 1700
    return smoothstep(0.32, 0.6, this.noise.noise2D(u + salt * 13.7, v - salt * 7.3 + t / 5000))
  }

  /**
   * Where to read the biome for the weather at (x, z): the place itself,
   * shifted up to BIOME_WARP blocks by slow noise, so a weather's look
   * changes along a meandering line instead of a biome region's straight edge.
   */
  biomeWarp(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
    out.x = x + this.noise.noise2D(x / 420 + 71.1, z / 420 - 13.7) * BIOME_WARP
    out.z = z + this.noise.noise2D(x / 420 - 29.3, z / 420 + 55.9) * BIOME_WARP
    return out
  }

  /** 1 on nights some sky event happens (by the game day the night began on), else 0. */
  nightEvent(day: number, salt: number, chance: number): number {
    return this.hash(day, salt, 0x417e) / 4294967296 < chance ? 1 : 0
  }

  /** 32-bit hash of the seed and three integers. */
  private hash(a: number, b: number, c: number): number {
    let h = (this.seed ^ 0x9e3779b9) >>> 0
    h = Math.imul(h ^ (a | 0), 0x85ebca6b)
    h = Math.imul((h ^ (h >>> 13)) ^ (b | 0), 0xc2b2ae35)
    h = Math.imul((h ^ (h >>> 16)) ^ (c | 0), 0x27d4eb2f)
    h ^= h >>> 15
    h = Math.imul(h, 0x165667b1)
    h ^= h >>> 13
    return h >>> 0
  }

  /** How far the weather has drifted by time t (blocks, x and z). */
  private drift(t: number, out: { x: number; z: number }): void {
    const steps = Math.max(0, t) / DRIFT_STEP
    const whole = Math.floor(steps)
    this.ensureDrift(whole + 1)
    const p = this.driftPrefix
    const frac = steps - whole
    out.x = p[2 * whole] + (p[2 * whole + 2] - p[2 * whole]) * frac
    out.z = p[2 * whole + 1] + (p[2 * whole + 3] - p[2 * whole + 1]) * frac
  }

  private ensureDrift(count: number): void {
    if (count < this.driftCount) return
    if (2 * (count + 1) > this.driftPrefix.length) {
      const grown = new Float64Array(Math.max(2 * (count + 1), this.driftPrefix.length * 2))
      grown.set(this.driftPrefix)
      this.driftPrefix = grown
    }
    const p = this.driftPrefix
    for (let i = this.driftCount; i <= count; i++) {
      const angle = this.driftAngle((i - 0.5) * DRIFT_STEP)
      p[2 * i] = p[2 * i - 2] + Math.cos(angle) * STEER_SPEED * DRIFT_STEP
      p[2 * i + 1] = p[2 * i - 1] + Math.sin(angle) * STEER_SPEED * DRIFT_STEP
    }
    this.driftCount = count + 1
  }
}
