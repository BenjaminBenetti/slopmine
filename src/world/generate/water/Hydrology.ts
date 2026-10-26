import { SimplexNoise } from '../SimplexNoise.ts'

/**
 * The overworld's big water: oceans and rivers. A pure function of the world
 * seed and position (worker-safe, no world access), shared by the generation
 * worker's blended terrain height, the main thread's biome heights (surface
 * band estimates, decorations, spawn) and the river currents, so terrain,
 * far terrain (LOD runs the same pipeline), physics and rendering agree.
 *
 * - Oceans: a slow, domain-warped "continent" field `c`. Below 0 the land
 *   sinks to a sea floor that deepens to ~43 blocks below the surface over a
 *   shelf; just above 0 a coastal band flattens the land toward the water
 *   (beaches). Islands rise where a second noise peaks out at sea.
 * - Rivers and streams: zero-crossings of two domain-warped noises (wide,
 *   sparse rivers; narrow, denser streams) carve channels down below the
 *   water surface and valleys around them, through every biome, at every
 *   altitude - so all rivers lie level with the sea and need no flowing
 *   water. A low-frequency mask breaks the networks into reaches that start
 *   at springs; rivers widen into estuaries near the coast.
 *
 * `shapeHeight` only ever lowers terrain (and, for biomes without water of
 * their own, raises the land around their water - see `bankFloor`), and is
 * monotone in the input height: the blended height of the shaped biomes stays
 * between their shaped heights, which keeps the surface band estimates valid.
 *
 * A biome without water of its own (desert, volcanic) fills only these
 * waters, so its land below the water line would stand dry beside them.
 * Instead a river crossing low land floods it: every column within the
 * river's flood reach is water wherever the land lies below the surface
 * (`floodplain` - a lake around the river), and past that reach the land is
 * raised to the water line and slopes gently back down to its own height
 * (a bank, not a wall: 3-block levees left rivers standing on the land like
 * aqueducts). Dry coasts slope up to the water line the same way.
 */

/** Surface of the overworld's oceans, rivers and lakes (world Y; the swamp's pools too). */
export const WATER_SURFACE_Y = 238

// Continents
const CONTINENT_SCALE = 1 / 2600
const CONTINENT_OCTAVES = 5
const CONTINENT_WARP_SCALE = 1 / 1400
const CONTINENT_WARP = 420
/** Shifts the continent field: the ocean's share of the world (calibrated: ~28% of the area). */
const CONTINENT_BIAS = -0.11
/** Land is boosted around the world origin, so the spawn is on a continent. */
const SPAWN_LAND_RADIUS = 1500
const SPAWN_LAND_BOOST = 0.35
/** Width of the coastal band, in continent units (~60-100 blocks): land eases down to the beach over it. */
const COAST_BAND = 0.05
/** Height the coastal band starts from at the waterline, and rises across it. */
const COAST_RISE = 12
/** Continent value at which the sea floor reaches its full depth (the shelf). */
const OCEAN_SHELF = 0.28
const OCEAN_MAX_DEPTH = 44
/** Continent value below which a whole biome region is the Ocean biome (its centre deep at sea). */
export const OCEAN_REGION_CONTINENT = -0.1

// Islands
const ISLAND_SCALE = 1 / 280
const ISLAND_START = 0.55
const ISLAND_FULL = 0.85

// Rivers and streams: noise zero-crossings; distance in blocks ~ |n| / (scale * mean gradient near the crossings, measured)
const NOISE_MEAN_GRADIENT = 4.0
interface NetworkParams {
  readonly scale: number
  readonly warpScale: number
  readonly warp: number
  readonly maskScale: number
  /** Mask value where reaches start (below: no channel). */
  readonly maskMin: number
  readonly maskFade: number
  readonly minHalfWidth: number
  readonly maxHalfWidth: number
  readonly minDepth: number
  readonly maxDepth: number
  /** Valley wall rise per block from the channel edge. */
  readonly valleySlope: number
  /** Surface current at the centre line (blocks/s). */
  readonly speed: number
  /** How far it floods a dry biome's low land beyond its edge (blocks, before noise). */
  readonly floodReach: number
}
/** How far a river or stream floods low land beyond its channel edge in a dry biome (blocks, ×0.55-1.45 by noise). */
const RIVER_FLOOD_REACH = 22
const STREAM_FLOOD_REACH = 9
const RIVERS: NetworkParams = {
  scale: 1 / 900, warpScale: 1 / 420, warp: 90, maskScale: 1 / 2200, maskMin: -0.55, maskFade: 0.25,
  minHalfWidth: 3, maxHalfWidth: 7.5, minDepth: 5, maxDepth: 7.5, valleySlope: 0.45, speed: 2.2,
  floodReach: RIVER_FLOOD_REACH,
}
const STREAMS: NetworkParams = {
  scale: 1 / 380, warpScale: 1 / 190, warp: 36, maskScale: 1 / 1300, maskMin: -0.15, maskFade: 0.2,
  minHalfWidth: 1.2, maxHalfWidth: 2.6, minDepth: 2, maxDepth: 3.2, valleySlope: 0.9, speed: 1.4,
  floodReach: STREAM_FLOOD_REACH,
}
/** Rivers widen toward the sea over this much of the continent field. */
const ESTUARY_BAND = 0.12
const ESTUARY_WIDEN = 1.4
/** Valley walls stop mattering this far above the water (no overworld land stands higher). */
const VALLEY_REACH = 80
const FLOOD_NOISE_SCALE = 1 / 90
/** Past the flood reach (and up from a dry coast) the land is raised to the water line, falling away this steeply. */
const BANK_SLOPE = 0.4
/** The bank stays at the water line this far past the flood reach (the distance estimate can step 2-3 blocks between columns). */
const BANK_TOP = 3
/** A bank stops mattering this far out from the flood reach (40 blocks below the water: no dry land lies lower). */
const BANK_REACH = BANK_TOP + 40 / BANK_SLOPE
/** A fading reach's valley rises this far per unit of fade lost (its bed comes up to the surface: the spring). */
const SPRING_RISE = 120
/**
 * Upstream of a spring the bank stays whole for this much fade (fade falls by
 * ~0.01 per block there), then sinks this far per unit of fade lost - a slope
 * of about 0.6 blocks per block back into the land.
 */
const SPRING_BANK_TOP = 0.03
const SPRING_BANK_SINK = 60
/** The coastal band's bank: at the water line this far in (continent units: steep coasts gain ~0.0025 per block), then falling this far across the band (to well below any dry land: no effect at its inner edge). */
const COAST_BANK_TOP = 0.006
const COAST_BANK_DROP = 32

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** One column's water, read by `sample` (reusable). */
export interface HydrologySample {
  /** Continent field: < 0 at sea. */
  continent: number
  /** Highest the land may stand here because of the sea (Infinity inland), and how strongly it applies (0-1). */
  seaCap: number
  seaCapStrength: number
  /** Highest the land may stand because of a river or stream valley (Infinity away from them). */
  valleyCap: number
  /** Inside a river or stream channel (the bed lies below the water surface). */
  inChannel: boolean
  /** Within a channel's flood reach: a dry biome's land below the water line is water here (a lake around the river). */
  floodplain: boolean
  /** Lowest a dry biome's land may lie here, outside floodplains (-Infinity away from the water): its banks. */
  bankFloor: number
}

interface Network {
  readonly params: NetworkParams
  readonly noise: SimplexNoise
  readonly warpX: SimplexNoise
  readonly warpZ: SimplexNoise
  readonly mask: SimplexNoise
  readonly width: SimplexNoise
  readonly flood: SimplexNoise
}

const cache = new Map<number, Hydrology>()

export class Hydrology {
  private readonly continentNoise: SimplexNoise
  private readonly continentWarpX: SimplexNoise
  private readonly continentWarpZ: SimplexNoise
  private readonly floorNoise: SimplexNoise
  private readonly islandNoise: SimplexNoise
  private readonly rivers: Network
  private readonly streams: Network
  private readonly scratch: HydrologySample = {
    continent: 0, seaCap: Infinity, seaCapStrength: 0, valleyCap: Infinity, inChannel: false, floodplain: false, bankFloor: -Infinity,
  }

  /** The hydrology of a world seed (cached: building the noise tables costs more than sampling). */
  static forSeed(seed: number): Hydrology {
    let hydrology = cache.get(seed)
    if (!hydrology) {
      hydrology = new Hydrology(seed)
      cache.set(seed, hydrology)
      if (cache.size > 4) cache.delete(cache.keys().next().value!)
    }
    return hydrology
  }

  private constructor(seed: number) {
    const sub = (salt: number): SimplexNoise => new SimplexNoise((seed ^ salt) >>> 0)
    this.continentNoise = sub(0x0c3a71)
    this.continentWarpX = sub(0x5e1d02)
    this.continentWarpZ = sub(0x2b9f43)
    this.floorNoise = sub(0x71ce04)
    this.islandNoise = sub(0x1a5105)
    const network = (params: NetworkParams, salt: number): Network => ({
      params,
      noise: sub(salt),
      warpX: sub(salt ^ 0x111),
      warpZ: sub(salt ^ 0x222),
      mask: sub(salt ^ 0x333),
      width: sub(salt ^ 0x444),
      flood: sub(salt ^ 0x555),
    })
    this.rivers = network(RIVERS, 0x417e8a)
    this.streams = network(STREAMS, 0x3c9e6b)
  }

  /** The continent field at a column: < 0 at sea, > COAST_BAND well inland. */
  continent(x: number, z: number): number {
    const wx = this.continentWarpX.noise2D(x * CONTINENT_WARP_SCALE, z * CONTINENT_WARP_SCALE) * CONTINENT_WARP
    const wz = this.continentWarpZ.noise2D(x * CONTINENT_WARP_SCALE + 17.3, z * CONTINENT_WARP_SCALE - 9.1) * CONTINENT_WARP
    let c = this.continentNoise.fractalNoise2D(x + wx, z + wz, CONTINENT_OCTAVES, 0.5, CONTINENT_SCALE) - CONTINENT_BIAS
    const r2 = (x * x + z * z) / (SPAWN_LAND_RADIUS * SPAWN_LAND_RADIUS)
    if (r2 < 9) c += SPAWN_LAND_BOOST * Math.exp(-r2)
    return c
  }

  /** At sea here (the continent field is below the waterline). */
  isOcean(x: number, z: number): boolean {
    return this.continent(x, z) < 0
  }

  /** Read everything about a column's water into `out` (the scratch sample if omitted). */
  sample(x: number, z: number, out: HydrologySample = this.scratch): HydrologySample {
    const c = this.continent(x, z)
    out.continent = c
    out.inChannel = false
    out.floodplain = false
    out.bankFloor = -Infinity
    out.valleyCap = Infinity

    // The sea: a floor below the waterline, a coastal band easing the land down to it
    if (c < 0) {
      const deep = smoothstep(0, OCEAN_SHELF, -c)
      // Rolling sea floor: dunes and gullies, more of them out deep
      const relief = this.floorNoise.fractalNoise2D(x, z, 3, 0.5, 1 / 70) * (2 + 4 * deep)
      let cap = WATER_SURFACE_Y + 1 - OCEAN_MAX_DEPTH * deep + relief * smoothstep(0.01, 0.06, -c)
      // Islands: the land beneath shows through where the island noise peaks, away from the coast
      const island = smoothstep(ISLAND_START, ISLAND_FULL, this.islandNoise.fractalNoise2D(x, z, 2, 0.5, ISLAND_SCALE))
      if (island > 0) cap += (WATER_SURFACE_Y + COAST_RISE - cap) * island * smoothstep(0.03, 0.1, -c)
      out.seaCap = cap
      out.seaCapStrength = 1
    } else if (c < COAST_BAND) {
      out.seaCap = WATER_SURFACE_Y + 1 + COAST_RISE * (c / COAST_BAND)
      out.seaCapStrength = 1 - smoothstep(0, COAST_BAND, c)
      out.bankFloor = WATER_SURFACE_Y + 1 - COAST_BANK_DROP * (Math.max(0, c - COAST_BANK_TOP) / COAST_BAND)
    } else {
      out.seaCap = Infinity
      out.seaCapStrength = 0
    }

    // Rivers, then streams: the lower valley wins
    if (c > -0.02) {
      this.applyNetwork(this.rivers, x, z, c, out)
      this.applyNetwork(this.streams, x, z, c, out)
    }
    return out
  }

  private applyNetwork(net: Network, x: number, z: number, c: number, out: HydrologySample): void {
    const p = net.params
    const mask = net.mask.noise2D(x * p.maskScale, z * p.maskScale)
    if (mask <= p.maskMin) return
    const fade = smoothstep(p.maskMin, p.maskMin + p.maskFade, mask)
    const n = this.networkValue(net, x, z)
    const distance = Math.abs(n) / (p.scale * NOISE_MEAN_GRADIENT)
    // Far outside any valley this network could carve here
    const reachLimit = p.maxHalfWidth * (1 + ESTUARY_WIDEN) + Math.max(VALLEY_REACH / p.valleySlope, p.floodReach * 1.45 + BANK_REACH)
    if (distance > reachLimit) return

    const widthNoise = 0.5 + 0.5 * net.width.noise2D(x * p.scale * 2.3, z * p.scale * 2.3)
    const estuary = 1 + ESTUARY_WIDEN * (1 - smoothstep(0, ESTUARY_BAND, c))
    const halfWidth = (p.minHalfWidth + (p.maxHalfWidth - p.minHalfWidth) * widthNoise) * estuary * fade
    const depth = (p.minDepth + (p.maxDepth - p.minDepth) * widthNoise) * Math.min(1, 0.4 + fade)
    const inside = halfWidth > 0.5 && distance < halfWidth
    let cap: number
    if (inside) {
      const t = distance / halfWidth
      cap = WATER_SURFACE_Y - depth * (1 - t * t)
    } else {
      cap = WATER_SURFACE_Y + (distance - Math.max(halfWidth, 0)) * p.valleySlope
    }
    // Where the reach fades out its valley rises away with it (a spring at the
    // head of a river): its bed reaches the surface where fade falls to springFade
    cap += (1 - fade) * SPRING_RISE
    if (inside && cap < WATER_SURFACE_Y - 0.5) out.inChannel = true
    if (cap < out.valleyCap) out.valleyCap = cap
    const springFade = 1 - depth / SPRING_RISE
    if (halfWidth > 0.5) {
      // A dry biome's low land floods within the reach - only where the channel
      // runs, the reach growing from nothing at its spring - and past it the bank
      // falls away; upstream of the spring the bank sinks back into the land
      const flood = 0.55 + 0.9 * (0.5 + 0.5 * net.flood.noise2D(x * FLOOD_NOISE_SCALE, z * FLOOD_NOISE_SCALE))
      const reach = p.floodReach * flood * clamp01((fade - springFade) / (1 - springFade))
      const edge = distance - halfWidth
      if (reach > 0 && edge < reach) out.floodplain = true
      else {
        const floor = WATER_SURFACE_Y + 1 - Math.max(0, edge - reach - BANK_TOP) * BANK_SLOPE - Math.max(0, springFade - fade - SPRING_BANK_TOP) * SPRING_BANK_SINK
        if (floor > out.bankFloor) out.bankFloor = floor
      }
    }
  }

  private networkValue(net: Network, x: number, z: number): number {
    const p = net.params
    const wx = net.warpX.noise2D(x * p.warpScale, z * p.warpScale) * p.warp
    const wz = net.warpZ.noise2D(x * p.warpScale + 31.7, z * p.warpScale - 12.9) * p.warp
    return net.noise.noise2D((x + wx) * p.scale, (z + wz) * p.scale)
  }

  /**
   * The terrain height after the sea and the rivers have shaped it. `dryness`
   * (0-1) is how much of the column's biome has no water of its own (desert,
   * volcanic - blended across region borders): there the banks are raised to
   * the water line, so the water put into oceans and channels (see
   * `isWaterBody`) is held in instead of standing as a wall next to a dry hollow.
   */
  shapeHeight(height: number, x: number, z: number, dryness: number, sample?: HydrologySample): number {
    const s = sample ?? this.sample(x, z)
    let h = height
    if (s.seaCapStrength > 0 && h > s.seaCap) h -= s.seaCapStrength * (h - s.seaCap)
    if (h > s.valleyCap) h = s.valleyCap
    if (dryness >= 0.5 && !s.floodplain && s.continent >= 0) h = Math.max(h, s.bankFloor)
    return h
  }

  /** The sea, or a river or stream channel (a dry biome also fills the `floodplain` around its channels). */
  isWaterBody(x: number, z: number, sample?: HydrologySample): boolean {
    const s = sample ?? this.sample(x, z)
    return s.continent < 0 || s.inChannel
  }

  /**
   * The river current at a column: writes the unit direction into `out` and
   * returns the surface speed (blocks/s), 0 outside the channels. Rivers run
   * along their channel toward the sea (down the continent field).
   */
  flowAt(x: number, z: number, out: { x: number; z: number }): number {
    out.x = 0
    out.z = 0
    const c = this.continent(x, z)
    if (c < -0.02) return 0
    let best = 0
    for (const net of [this.rivers, this.streams]) {
      const p = net.params
      const mask = net.mask.noise2D(x * p.maskScale, z * p.maskScale)
      if (mask <= p.maskMin) continue
      const fade = smoothstep(p.maskMin, p.maskMin + p.maskFade, mask)
      const n = this.networkValue(net, x, z)
      const distance = Math.abs(n) / (p.scale * NOISE_MEAN_GRADIENT)
      const widthNoise = 0.5 + 0.5 * net.width.noise2D(x * p.scale * 2.3, z * p.scale * 2.3)
      const estuary = 1 + ESTUARY_WIDEN * (1 - smoothstep(0, ESTUARY_BAND, c))
      const halfWidth = (p.minHalfWidth + (p.maxHalfWidth - p.minHalfWidth) * widthNoise) * estuary * fade
      if (halfWidth <= 0.5 || distance >= halfWidth) continue
      const t = distance / halfWidth
      // Estuaries slow down as they widen into the sea
      const speed = p.speed * (1 - t * t) * fade / Math.sqrt(estuary)
      if (speed <= best) continue
      // Along the channel: perpendicular to the noise gradient, turned to run down the continent field
      const e = 1.5
      const gx = this.networkValue(net, x + e, z) - this.networkValue(net, x - e, z)
      const gz = this.networkValue(net, x, z + e) - this.networkValue(net, x, z - e)
      const g = Math.hypot(gx, gz)
      if (g < 1e-6) continue
      let tx = gz / g
      let tz = -gx / g
      const e2 = 24
      const downX = this.continent(x - e2, z) - this.continent(x + e2, z)
      const downZ = this.continent(x, z - e2) - this.continent(x, z + e2)
      const along = tx * downX + tz * downZ
      if (along < 0) {
        tx = -tx
        tz = -tz
      }
      // Weak where the channel runs across the slope of the land (the two directions meet there)
      const downLength = Math.hypot(downX, downZ)
      const certainty = downLength > 1e-6 ? Math.min(1, (Math.abs(along) / downLength) * 3) : 0
      best = speed * (0.35 + 0.65 * certainty)
      out.x = tx
      out.z = tz
    }
    return best
  }
}
