import * as THREE from 'three'
import { moonDirectionAt, sunDirectionAt, sunElevationAt } from '../../daynight/WorldClock.ts'

/**
 * Turns the hour of day into how the overworld looks: where the sun and moon
 * are, which of them the directional light follows, how bright sky light is,
 * the light's colour (warm low sun, cool moonlight) and the sky's palette
 * (twilight glow, night colours, stars). Multipliers on top of the biome
 * atmosphere - a swamp night is a darker swamp, not a different place.
 *
 * Everything eases to "no change" with the surface weight: the Hell layer has
 * no day and no night.
 */

/** Sky-light brightness at night (× the biome's daylight): moonlit, readable, torches matter. */
export const NIGHT_DAYLIGHT = 0.15

/** Directional light colour of the moon relative to the biome light (linear). */
const MOON_LIGHT_TINT = new THREE.Color(0.58, 0.7, 1.0)
/** Light colour of a low sun (linear). */
const LOW_SUN_TINT = new THREE.Color(1.0, 0.66, 0.42)

/** Night sky colours (linear) before the biome's own hue is mixed in. */
const NIGHT_ZENITH = new THREE.Color(0.0045, 0.008, 0.026)
const NIGHT_HORIZON = new THREE.Color(0.022, 0.032, 0.062)
/** Twilight glow near the horizon toward the sun (linear, additive). */
const TWILIGHT_GLOW = new THREE.Color(1.1, 0.42, 0.13)
/** Low sun disc colour. */
const LOW_SUN_COLOR = new THREE.Color(1.0, 0.5, 0.24)
const DAY_SUN_COLOR = new THREE.Color(1.0, 0.93, 0.8)

/** Lowest elevation (sine) the directional light is held at: grazing light acnes shadows and floods sides. */
const MIN_LIGHT_ELEVATION = 0.12

export interface DayNightState {
  /** Toward the sun (may be below the horizon). */
  readonly sunDirection: THREE.Vector3
  /** Toward the moon. */
  readonly moonDirection: THREE.Vector3
  /** The directional light's direction: the sun by day, the moon by night (elevation clamped). */
  readonly lightDirection: THREE.Vector3
  /** Directional light strength multiplier (dips to 0 as the light changes over at the horizon). */
  lightIntensity: number
  /** Multiplier on the biome's daylight. */
  daylight: number
  /** Multiplier on the biome light tint. */
  readonly lightTint: THREE.Color
  /** 0 day .. 1 night: sky palette, stars, moon. */
  night: number
  /** Strength of the twilight glow (0-1). */
  twilight: number
  readonly twilightColor: THREE.Color
  /** Sun disc/halo colour (warm when low). */
  readonly sunColor: THREE.Color
  /** Night sky zenith and horizon (linear), resolved per frame. */
  readonly nightZenith: THREE.Color
  readonly nightHorizon: THREE.Color
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export class DayNightSky {
  readonly state: DayNightState = {
    sunDirection: new THREE.Vector3(0, 1, 0),
    moonDirection: new THREE.Vector3(0, -1, 0),
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    daylight: 1,
    lightTint: new THREE.Color(1, 1, 1),
    night: 0,
    twilight: 0,
    twilightColor: TWILIGHT_GLOW.clone(),
    sunColor: DAY_SUN_COLOR.clone(),
    nightZenith: NIGHT_ZENITH.clone(),
    nightHorizon: NIGHT_HORIZON.clone(),
  }

  private readonly scratch = new THREE.Color()

  /**
   * @param hour hour of day (0-24)
   * @param surface 1 on the surface layer, 0 in Hell (eases everything to "no change")
   * @param biomeHorizon the biome's day horizon colour (linear): a hint of its hue tints the night
   */
  update(hour: number, surface: number, biomeHorizon: THREE.Color): void {
    const s = this.state
    sunDirectionAt(hour, s.sunDirection)
    moonDirectionAt(hour, s.moonDirection)
    const e = sunElevationAt(hour)
    const w = Math.min(1, Math.max(0, surface))

    // Sky light: full from ~7:00 to ~17:00, half at sunset, moonlight by ~18:50
    const day = smoothstep(-0.2, 0.25, e)
    s.daylight = 1 + (NIGHT_DAYLIGHT + (1 - NIGHT_DAYLIGHT) * day - 1) * w

    // Directional light: whichever body is up; fades out around the change-over
    const sunUp = e > 0
    const body = sunUp ? s.sunDirection : s.moonDirection
    s.lightDirection.copy(body)
    if (s.lightDirection.y < MIN_LIGHT_ELEVATION) {
      const horizontal = Math.hypot(s.lightDirection.x, s.lightDirection.z) || 1
      const k = Math.sqrt(1 - MIN_LIGHT_ELEVATION * MIN_LIGHT_ELEVATION) / horizontal
      s.lightDirection.set(s.lightDirection.x * k, MIN_LIGHT_ELEVATION, s.lightDirection.z * k)
    }
    // (the moon at a quarter of the sun's strength: as bright as before the sun was raised)
    const bodyIntensity = sunUp ? smoothstep(0, 0.16, e) : 0.53 * smoothstep(0, 0.2, s.moonDirection.y)
    s.lightIntensity = 1 + (bodyIntensity - 1) * w

    // Light colour: white by day, warm as the sun gets low, cool moonlight at night
    const warm = smoothstep(0.35, 0.02, e) * smoothstep(-0.14, 0.0, e)
    const cool = smoothstep(0.0, -0.18, e)
    this.scratch.setRGB(1, 1, 1).lerp(LOW_SUN_TINT, warm).lerp(MOON_LIGHT_TINT, cool)
    s.lightTint.setRGB(1, 1, 1).lerp(this.scratch, w)

    // Sky palette
    // The sky starts to dim well before sunset, so the twilight glow reads
    s.night = smoothstep(0.15, -0.2, e) * w
    s.twilight = smoothstep(0.3, 0.02, e) * smoothstep(-0.26, -0.04, e) * w
    s.sunColor.copy(DAY_SUN_COLOR).lerp(LOW_SUN_COLOR, smoothstep(0.3, 0.0, e))
    // A quarter of the biome's horizon hue survives into the night (normalised to unit luminance)
    const lum = Math.max(1e-4, 0.2126 * biomeHorizon.r + 0.7152 * biomeHorizon.g + 0.0722 * biomeHorizon.b)
    this.scratch.setRGB(biomeHorizon.r / lum, biomeHorizon.g / lum, biomeHorizon.b / lum)
    s.nightHorizon.setRGB(1, 1, 1).lerp(this.scratch, 0.25).multiply(NIGHT_HORIZON)
    s.nightZenith.setRGB(1, 1, 1).lerp(this.scratch, 0.15).multiply(NIGHT_ZENITH)
  }
}
