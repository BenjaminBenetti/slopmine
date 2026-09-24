import * as THREE from 'three'
import { LIGHT_FLOOR } from '../lightCurve.ts'

/** Default clear-sky colors (sRGB hex). Biomes tint or replace these. */
export const SKY_ZENITH_HEX = 0x3d8fe6
export const SKY_HORIZON_HEX = 0xa9d4f0

/** Fair-weather cloud coverage (fraction of the sky), the default for biomes that set none. */
export const DEFAULT_CLOUD_COVERAGE = 0.42

/** How fast the live atmosphere eases toward a new biome's target (1/s). */
const BLEND_SPEED = 2.0

/**
 * Resolved atmosphere values for one point in the world. Colors are linear
 * working-space values; tints are plain per-channel multipliers.
 */
export interface AtmosphereTarget {
  skyBrightness: number
  readonly skyTint: THREE.Color
  /** Final horizon/fog color before brightness (linear). */
  readonly horizonColor: THREE.Color
  /** Sky/fog color below the sky-darkness band (linear). */
  readonly undergroundColor: THREE.Color
  fogDensity: number
  readonly lightTint: THREE.Color
  /** Light floor where no sky/block light reaches (linear RGB). */
  readonly lightFloor: THREE.Color
  /** Sky light brightness 0-1 (overcast biomes < 1). */
  daylight: number
  /** Fraction of the sky covered by clouds (0-1). */
  cloudCoverage: number
  /** Cloud colour multiplier (linear). */
  readonly cloudTint: THREE.Color
  /** Cloud density multiplier (0-1). */
  cloudOpacity: number
}

export function createAtmosphereTarget(): AtmosphereTarget {
  return {
    skyBrightness: 1,
    skyTint: new THREE.Color(1, 1, 1),
    horizonColor: new THREE.Color(SKY_HORIZON_HEX),
    undergroundColor: new THREE.Color(0, 0, 0),
    fogDensity: 1,
    lightTint: new THREE.Color(1, 1, 1),
    lightFloor: new THREE.Color(LIGHT_FLOOR, LIGHT_FLOOR, LIGHT_FLOOR),
    daylight: 1,
    cloudCoverage: DEFAULT_CLOUD_COVERAGE,
    cloudTint: new THREE.Color(1, 1, 1),
    cloudOpacity: 1,
  }
}

/**
 * The live, smoothly blended biome atmosphere around the player.
 * BiomeSkyboxManager sets the target; the sky, distance fog and world
 * lighting read the eased values each frame.
 */
export class BiomeAtmosphere {
  private readonly current: AtmosphereTarget = createAtmosphereTarget()
  private readonly target: AtmosphereTarget = createAtmosphereTarget()
  private hasTarget = false

  get skyBrightness(): number { return this.current.skyBrightness }
  get skyTint(): THREE.Color { return this.current.skyTint }
  get horizonColor(): THREE.Color { return this.current.horizonColor }
  get undergroundColor(): THREE.Color { return this.current.undergroundColor }
  get fogDensity(): number { return this.current.fogDensity }
  get lightTint(): THREE.Color { return this.current.lightTint }
  get lightFloor(): THREE.Color { return this.current.lightFloor }
  get daylight(): number { return this.current.daylight }
  get cloudCoverage(): number { return this.current.cloudCoverage }
  get cloudTint(): THREE.Color { return this.current.cloudTint }
  get cloudOpacity(): number { return this.current.cloudOpacity }

  /**
   * Set the values to ease toward (copied). The very first target is applied
   * immediately so the world doesn't fade in from the default sky at spawn.
   */
  setTarget(target: AtmosphereTarget): void {
    copyAtmosphere(this.target, target)
    if (!this.hasTarget) {
      this.hasTarget = true
      copyAtmosphere(this.current, target)
    }
  }

  /** Ease the live values toward the target. Call once per frame. */
  update(deltaTime: number): void {
    const k = Math.min(1, BLEND_SPEED * deltaTime)
    const c = this.current
    const t = this.target
    c.skyBrightness += (t.skyBrightness - c.skyBrightness) * k
    c.fogDensity += (t.fogDensity - c.fogDensity) * k
    c.daylight += (t.daylight - c.daylight) * k
    c.cloudCoverage += (t.cloudCoverage - c.cloudCoverage) * k
    c.cloudOpacity += (t.cloudOpacity - c.cloudOpacity) * k
    c.cloudTint.lerp(t.cloudTint, k)
    c.skyTint.lerp(t.skyTint, k)
    c.horizonColor.lerp(t.horizonColor, k)
    c.undergroundColor.lerp(t.undergroundColor, k)
    c.lightTint.lerp(t.lightTint, k)
    c.lightFloor.lerp(t.lightFloor, k)
  }
}

function copyAtmosphere(out: AtmosphereTarget, src: AtmosphereTarget): void {
  out.skyBrightness = src.skyBrightness
  out.fogDensity = src.fogDensity
  out.daylight = src.daylight
  out.cloudCoverage = src.cloudCoverage
  out.cloudOpacity = src.cloudOpacity
  out.cloudTint.copy(src.cloudTint)
  out.skyTint.copy(src.skyTint)
  out.horizonColor.copy(src.horizonColor)
  out.undergroundColor.copy(src.undergroundColor)
  out.lightTint.copy(src.lightTint)
  out.lightFloor.copy(src.lightFloor)
}
