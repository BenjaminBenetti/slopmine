import * as THREE from 'three'

export interface WorldLightingOptions {
  sunIntensity?: number
  ambientIntensity?: number
  hemisphereIntensity?: number
  sunColor?: number
  ambientColor?: number
  /** Hemisphere light color from above (sky bounce). */
  skyColor?: number
  /** Hemisphere light color from below (ground bounce) - keep it light or sides go murky. */
  groundColor?: number
  timeOfDay?: number // 0-24 hours
  shadowMapSize?: number // Shadow map resolution
  shadowFrustumSize?: number // Shadow camera frustum size in blocks
}

/**
 * The rig's default colours and intensities. Exported so surfaces lit by
 * their own copy of the rig (the held item's overlay scene) match the world.
 */
export const WORLD_LIGHT_DEFAULTS = {
  sunIntensity: 1.4,
  ambientIntensity: 0.9,
  hemisphereIntensity: 0.9,
  sunColor: 0xfff0dc,
  ambientColor: 0xf2f5ff,
  skyColor: 0xcfe0ff,
  groundColor: 0xb7a27e,
} as const

export interface ShadowTarget {
  x: number
  y: number
  z: number
}

/**
 * The world's light rig: a warm directional sun, a cool ambient fill and a
 * sky/ground hemisphere bounce. With three.js' Lambert (irradiance / π) the
 * defaults give face brightness factors of roughly: top 0.83, sunward sides
 * 0.57-0.63, shaded sides 0.43, bottom 0.38 (warm bounce) - enough contrast
 * to read block shapes without crushing shaded faces.
 */
export class WorldLighting {
  readonly sun: THREE.DirectionalLight
  readonly ambient: THREE.AmbientLight
  readonly hemisphere: THREE.HemisphereLight

  private readonly shadowFrustumSize: number
  private readonly sunDistance: number = 150
  private readonly sunDirection: THREE.Vector3 = new THREE.Vector3()
  private readonly baseSunIntensity: number

  // Untinted base colors; setTint() multiplies these (biome light tint).
  private readonly baseSunColor: THREE.Color
  private readonly baseAmbientColor: THREE.Color
  private readonly baseSkyColor: THREE.Color
  private readonly baseGroundColor: THREE.Color

  constructor(options: WorldLightingOptions = {}) {
    const {
      sunIntensity = WORLD_LIGHT_DEFAULTS.sunIntensity,
      ambientIntensity = WORLD_LIGHT_DEFAULTS.ambientIntensity,
      hemisphereIntensity = WORLD_LIGHT_DEFAULTS.hemisphereIntensity,
      sunColor = WORLD_LIGHT_DEFAULTS.sunColor,
      ambientColor = WORLD_LIGHT_DEFAULTS.ambientColor,
      skyColor = WORLD_LIGHT_DEFAULTS.skyColor,
      groundColor = WORLD_LIGHT_DEFAULTS.groundColor,
      timeOfDay = 10,
      shadowMapSize = 8192,
      shadowFrustumSize = 128,
    } = options

    this.shadowFrustumSize = shadowFrustumSize
    this.baseSunIntensity = sunIntensity
    this.ambient = new THREE.AmbientLight(ambientColor, ambientIntensity)
    this.sun = new THREE.DirectionalLight(sunColor, sunIntensity)
    this.hemisphere = new THREE.HemisphereLight(skyColor, groundColor, hemisphereIntensity)

    this.baseSunColor = this.sun.color.clone()
    this.baseAmbientColor = this.ambient.color.clone()
    this.baseSkyColor = this.hemisphere.color.clone()
    this.baseGroundColor = this.hemisphere.groundColor.clone()

    // Enable shadow casting
    this.sun.castShadow = true

    // Configure shadow map
    this.sun.shadow.mapSize.width = shadowMapSize
    this.sun.shadow.mapSize.height = shadowMapSize

    // Configure shadow camera (orthographic for directional light)
    const shadowCam = this.sun.shadow.camera
    shadowCam.left = -shadowFrustumSize
    shadowCam.right = shadowFrustumSize
    shadowCam.top = shadowFrustumSize
    shadowCam.bottom = -shadowFrustumSize
    shadowCam.near = 0.5
    shadowCam.far = this.sunDistance * 2 + shadowFrustumSize * 2

    // Shadow bias to prevent shadow acne on voxel surfaces
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.02

    this.setTimeOfDay(timeOfDay)
  }

  setTimeOfDay(hour: number): void {
    // Convert hour (0-24) to sun position
    // 6am = sunrise (east), 12pm = noon (overhead), 6pm = sunset (west)
    const normalizedHour = ((hour - 6) / 12) * Math.PI // 0 at 6am, PI at 6pm

    const x = Math.cos(normalizedHour)
    const y = Math.sin(normalizedHour)
    const z = 50 / this.sunDistance // Slight offset for depth

    // Store normalized direction (10am ≈ 55° elevation); the sky's sun disc
    // reads it via getSunDirection() so the visible sun matches the shading.
    this.sunDirection.set(x, Math.max(y, 10 / this.sunDistance), z).normalize()

    this.sun.position.copy(this.sunDirection).multiplyScalar(this.sunDistance)
  }

  /**
   * Point the directional light along a direction (toward the light: the sun
   * by day, the moon by night - see DayNightSky) at a share of its full
   * strength. Cheap - call every frame.
   */
  setLightDirection(direction: THREE.Vector3, intensityScale: number = 1): void {
    this.sunDirection.copy(direction).normalize()
    this.sun.intensity = this.baseSunIntensity * intensityScale
  }

  /** Normalized direction toward the sun (the light travels opposite to it). */
  getSunDirection(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.sunDirection)
  }

  /**
   * Multiply every light's color by a tint (biome atmosphere). Cheap - call
   * every frame with the eased value.
   */
  setTint(tint: THREE.Color): void {
    this.sun.color.copy(this.baseSunColor).multiply(tint)
    this.ambient.color.copy(this.baseAmbientColor).multiply(tint)
    this.hemisphere.color.copy(this.baseSkyColor).multiply(tint)
    this.hemisphere.groundColor.copy(this.baseGroundColor).multiply(tint)
  }

  /**
   * Update shadow camera to follow a target (typically the player).
   * Call this every frame to keep shadows centered on the player.
   */
  updateShadowTarget(target: ShadowTarget): void {
    // Move the shadow camera target to follow the player
    this.sun.target.position.set(target.x, target.y, target.z)
    this.sun.target.updateMatrixWorld()

    // Keep the sun along the stored direction relative to the target
    this.sun.position.set(
      target.x + this.sunDirection.x * this.sunDistance,
      target.y + this.sunDirection.y * this.sunDistance,
      target.z + this.sunDirection.z * this.sunDistance
    )
  }

  setShadowsEnabled(enabled: boolean): void {
    this.sun.castShadow = enabled
  }

  setShadowMapSize(size: number): void {
    this.sun.shadow.mapSize.width = size
    this.sun.shadow.mapSize.height = size

    // Dispose existing shadow map to force regeneration
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose()
      this.sun.shadow.map = null
    }
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.ambient)
    scene.add(this.hemisphere)
    scene.add(this.sun)
    scene.add(this.sun.target) // Target must be added to scene for shadows
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.ambient)
    scene.remove(this.hemisphere)
    scene.remove(this.sun)
    scene.remove(this.sun.target)
  }

  dispose(): void {
    this.sun.dispose()
    this.ambient.dispose()
    this.hemisphere.dispose()
  }
}
