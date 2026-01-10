import * as THREE from 'three'

export interface WorldLightingOptions {
  sunIntensity?: number
  ambientIntensity?: number
  sunColor?: number
  ambientColor?: number
  timeOfDay?: number // 0-24 hours
  shadowMapSize?: number // Shadow map resolution
  shadowFrustumSize?: number // Shadow camera frustum size in blocks
}

export interface ShadowTarget {
  x: number
  y: number
  z: number
}

export class WorldLighting {
  readonly sun: THREE.DirectionalLight
  readonly ambient: THREE.AmbientLight

  private readonly shadowFrustumSize: number
  private readonly sunDistance: number = 150
  private readonly sunDirection: THREE.Vector3 = new THREE.Vector3()

  constructor(options: WorldLightingOptions = {}) {
    const {
      sunIntensity = 2.0,
      ambientIntensity = 1.0,
      sunColor = 0xffffff,
      ambientColor = 0xffffff,
      timeOfDay = 10,
      shadowMapSize = 8192,
      shadowFrustumSize = 128,
    } = options

    this.shadowFrustumSize = shadowFrustumSize
    this.ambient = new THREE.AmbientLight(ambientColor, ambientIntensity)
    this.sun = new THREE.DirectionalLight(sunColor, sunIntensity)

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

    // Store normalized direction for use in updateShadowTarget
    this.sunDirection.set(x, Math.max(y, 10 / this.sunDistance), z).normalize()

    this.sun.position.copy(this.sunDirection).multiplyScalar(this.sunDistance)
  }

  /**
   * Update shadow camera to follow a target (typically the player).
   * Call this every frame to keep shadows centered on the player.
   */
  updateShadowTarget(target: ShadowTarget): void {
    // Move the shadow camera target to follow the player
    this.sun.target.position.set(target.x, target.y, target.z)
    this.sun.target.updateMatrixWorld()

    // Update sun position relative to target using stored direction
    // Use a smaller Y multiplier (0.4) to get a shallower sun angle matching the old look
    this.sun.position.set(
      target.x + this.sunDirection.x * this.sunDistance,
      target.y + this.sunDirection.y * this.sunDistance * 0.4,
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
    scene.add(this.sun)
    scene.add(this.sun.target) // Target must be added to scene for shadows
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.ambient)
    scene.remove(this.sun)
    scene.remove(this.sun.target)
  }

  dispose(): void {
    this.sun.dispose()
    this.ambient.dispose()
  }
}
