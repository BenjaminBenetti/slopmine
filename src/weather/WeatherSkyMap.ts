import { createWeatherLook, type WeatherLook } from './WeatherLook.ts'
import { createAir, type WeatherAir } from './WeatherSystems.ts'
import type { WeatherState } from './WeatherState.ts'
import {
  COVER_BIAS, COVER_RANGE, WEATHER_FOG_SCALE, WEATHER_HAZE_SCALE, WEATHER_MAP_SIZE, WEATHER_TINT_SCALE, weatherFieldParams, weatherMapA, weatherMapB,
  weatherMapC,
} from '../renderer/weather/WeatherFieldShader.ts'

/**
 * The weather around the player as the sky, the clouds and the far land show
 * it (renderer/weather/WeatherFieldShader.ts, renderer/clouds): a
 * world-anchored, repeat-wrapped map of MAP_SIZE² cells of TEXEL blocks, each
 * holding the weather there as that cell's biome presents it - haze, ground
 * fog, storm darkness, cloud cover, its sky's tint and greyness - and the
 * clouds its air makes: how much, how tall, how puffy, an anvil. A rain belt
 * two kilometres off is a thick grey deck over a curtain of rain on that side
 * of the sky; a thunderstorm a tower with an anvil; a sandstorm over the
 * dunes a brown wall. Refreshed a slice of cells per frame (a full sweep
 * every few seconds).
 */

const MAP_SIZE = WEATHER_MAP_SIZE
const TEXEL = 64
/** Cells refreshed per frame. */
const CELLS_PER_FRAME = 40
/** Height the map reads weather at (above the pine snow line: snow shows as snow). */
const SAMPLE_Y = 300
/** Below this much haze or fog anywhere on the map, rays don't read it at all. */
const ACTIVE_HAZE = 2

export class WeatherSkyMap {
  readonly invSpan = 1 / (MAP_SIZE * TEXEL)
  /** Whether the last full sweep found any weather to show far off. */
  active = false
  private readonly dataA = weatherMapA.image.data as Uint8Array
  private readonly dataB = weatherMapB.image.data as Uint8Array
  private readonly dataC = weatherMapC.image.data as Uint8Array
  private cursor = 0
  /** Most haze or fog seen in the sweep under way. */
  private sweepMax = 0
  private readonly mix = new Map<string, number>()
  private readonly air = createAir()
  private readonly look = createWeatherLook()

  constructor(private readonly state: WeatherState) {
    weatherFieldParams.x = this.invSpan
  }

  /** Refresh the next slice of cells around the camera (surface weather only). */
  update(camX: number, camZ: number): void {
    const half = MAP_SIZE / 2
    const ccx = Math.floor(camX / TEXEL)
    const ccz = Math.floor(camZ / TEXEL)
    const total = MAP_SIZE * MAP_SIZE
    const a = this.dataA
    const b = this.dataB
    const c = this.dataC
    for (let n = 0; n < CELLS_PER_FRAME; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % total
      const cx = ccx - half + (i % MAP_SIZE)
      const cz = ccz - half + Math.floor(i / MAP_SIZE)
      const x = (cx + 0.5) * TEXEL
      const z = (cz + 0.5) * TEXEL
      const look = this.state.lookOf(this.state.mixAt(x, SAMPLE_Y, z, 1, 'wide', this.mix, this.air), this.look, this.air, 1)
      const tx = ((cx % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
      const tz = ((cz % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
      const o = (tz * MAP_SIZE + tx) * 4
      const haze = Math.round(Math.min(255, (255 * look.haze) / WEATHER_HAZE_SCALE))
      const fog = Math.round(Math.min(255, (255 * look.groundFog) / WEATHER_FOG_SCALE))
      a[o] = haze
      a[o + 1] = fog
      a[o + 2] = Math.round(255 * Math.min(1, Math.max(0, look.cloudDark)))
      a[o + 3] = Math.round(255 * Math.min(1, Math.max(0, (look.cloud + COVER_BIAS) / COVER_RANGE)))
      const amount = look.skyTintAmount
      b[o] = tint(look.skyTint[0], amount)
      b[o + 1] = tint(look.skyTint[1], amount)
      b[o + 2] = tint(look.skyTint[2], amount)
      b[o + 3] = Math.round(255 * Math.min(1, Math.max(0, look.skyGrey)))
      writeClouds(c, o, look, this.state.forced ? null : this.air)
      this.sweepMax = Math.max(this.sweepMax, haze, fog)
      if (this.cursor === 0) {
        this.active = this.sweepMax >= ACTIVE_HAZE
        this.sweepMax = 0
      }
    }
    weatherMapA.needsUpdate = true
    weatherMapB.needsUpdate = true
    weatherMapC.needsUpdate = true
  }

  /** Fill the whole map at once (loading in, or after a jump in time or place). */
  fill(camX: number, camZ: number): void {
    this.cursor = 0
    this.sweepMax = 0
    for (let n = 0; n < Math.ceil((MAP_SIZE * MAP_SIZE) / CELLS_PER_FRAME); n++) this.update(camX, camZ)
  }

  /** Cloud darkness of the cell at a world position (0-1), from the last sweep: where storms are. */
  darknessAt(x: number, z: number): number {
    const tx = ((Math.floor(x / TEXEL) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
    const tz = ((Math.floor(z / TEXEL) % MAP_SIZE) + MAP_SIZE) % MAP_SIZE
    return this.dataA[(tz * MAP_SIZE + tx) * 4 + 2] / 255
  }
}

function ramp(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The clouds a cell's air makes (map C): fair cumulus (puffy, ~150 blocks),
 * cumulus fields growing taller, overcast decks (flat thin sheets), rain decks
 * (thick, lower, still mostly sheet), storms (towers up to ~900 blocks, an
 * anvil spreading over them). A forced weather (debug) has no air: read from
 * its look instead.
 */
function writeClouds(out: Uint8Array, o: number, look: WeatherLook, air: WeatherAir | null): void {
  const cloud = air ? air.cloud : Math.max(0, look.cloud)
  const precip = air ? air.precip : Math.min(1, look.wet * 0.6)
  const storm = air ? air.storm : Math.min(1, look.lightning / 6)
  const anvil = air ? air.anvil : storm
  const deck = ramp(cloud, 0.7, 0.95)
  const stormy = ramp(storm, 0.25, 0.7)
  let thickness = 0.12 + 0.14 * cloud + (0.09 + 0.3 * precip - 0.12 - 0.14 * cloud) * deck
  thickness += (0.45 + 0.55 * storm - thickness) * stormy
  let puff = 1 + (0.25 + 0.3 * precip - 1) * deck
  puff += (0.9 - puff) * stormy
  out[o] = Math.round(255 * Math.min(1, Math.max(0, (look.cloud + COVER_BIAS) / COVER_RANGE)))
  out[o + 1] = Math.round(255 * Math.min(1, thickness))
  out[o + 2] = Math.round(255 * Math.min(1, Math.max(0, puff)))
  out[o + 3] = Math.round(255 * Math.min(1, anvil))
}

/** A sky tint applied by its amount, as the map stores it. */
function tint(channel: number, amount: number): number {
  return Math.round(Math.min(255, (255 * (1 + (channel - 1) * amount)) / WEATHER_TINT_SCALE))
}
