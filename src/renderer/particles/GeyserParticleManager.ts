import * as THREE from 'three'

/**
 * Singleton manager for volcanic geyser eruption particles.
 * Each eruption spawns two short-lived bursts above the vent: a gray steam
 * plume and a handful of orange embers, both drifting upward and fading.
 *
 * Follows the DiviningParticleManager pattern (plain THREE.Points +
 * PointsMaterial - no custom shaders, safe under the WebGPU renderer).
 *
 * @example
 * ```typescript
 * // Initialize once at startup
 * GeyserParticleManager.instance.initialize(renderer.scene)
 *
 * // Spawn a puff when a geyser erupts (vent-top world position)
 * GeyserParticleManager.instance.spawnEruption(x, y, z)
 *
 * // Update each frame
 * GeyserParticleManager.instance.update(deltaTime)
 * ```
 */
export class GeyserParticleManager {
  private static _instance: GeyserParticleManager | null = null

  private scene: THREE.Scene | null = null
  private readonly particleSystems: ParticleBurst[] = []

  // Steam plume
  private static readonly STEAM_COUNT = 20
  private static readonly STEAM_SIZE = 0.22
  private static readonly STEAM_COLOR = 0xd8d4cc // Pale ash-gray steam
  private static readonly STEAM_LIFETIME = 1.1 // seconds
  private static readonly STEAM_DRIFT = 7.0 // blocks per second upward
  private static readonly STEAM_SPREAD = 0.7

  // Embers
  private static readonly EMBER_COUNT = 10
  private static readonly EMBER_SIZE = 0.1
  private static readonly EMBER_COLOR = 0xff8c2a // Hot orange
  private static readonly EMBER_LIFETIME = 0.9 // seconds
  private static readonly EMBER_DRIFT = 9.0 // blocks per second upward
  private static readonly EMBER_SPREAD = 0.5

  private constructor() {
    // Private constructor for singleton
  }

  static get instance(): GeyserParticleManager {
    if (!GeyserParticleManager._instance) {
      GeyserParticleManager._instance = new GeyserParticleManager()
    }
    return GeyserParticleManager._instance
  }

  /**
   * Initializes the manager with a scene reference.
   * Must be called before spawning any particles.
   */
  initialize(scene: THREE.Scene): void {
    this.scene = scene
  }

  /**
   * Spawns a steam-and-ember burst at the given world position (vent top).
   */
  spawnEruption(x: number, y: number, z: number): void {
    if (!this.scene) {
      return
    }

    const steam = new ParticleBurst(
      x, y, z,
      GeyserParticleManager.STEAM_COUNT,
      GeyserParticleManager.STEAM_SIZE,
      GeyserParticleManager.STEAM_COLOR,
      GeyserParticleManager.STEAM_LIFETIME,
      GeyserParticleManager.STEAM_DRIFT,
      GeyserParticleManager.STEAM_SPREAD
    )
    const embers = new ParticleBurst(
      x, y, z,
      GeyserParticleManager.EMBER_COUNT,
      GeyserParticleManager.EMBER_SIZE,
      GeyserParticleManager.EMBER_COLOR,
      GeyserParticleManager.EMBER_LIFETIME,
      GeyserParticleManager.EMBER_DRIFT,
      GeyserParticleManager.EMBER_SPREAD
    )

    this.particleSystems.push(steam, embers)
    this.scene.add(steam.points)
    this.scene.add(embers.points)
  }

  /**
   * Updates all bursts and removes expired ones. Call each frame.
   */
  update(deltaTime: number): void {
    if (!this.scene) {
      return
    }

    for (let i = this.particleSystems.length - 1; i >= 0; i--) {
      const system = this.particleSystems[i]
      if (system.update(deltaTime)) {
        this.scene.remove(system.points)
        system.dispose()
        this.particleSystems.splice(i, 1)
      }
    }
  }

  /**
   * Removes all particles immediately.
   */
  clear(): void {
    if (!this.scene) {
      return
    }

    for (const system of this.particleSystems) {
      this.scene.remove(system.points)
      system.dispose()
    }
    this.particleSystems.length = 0
  }
}

/**
 * One burst of particles (same mechanics as DiviningParticleManager's system).
 */
class ParticleBurst {
  readonly points: THREE.Points
  private readonly positions: Float32Array
  private readonly velocities: Float32Array
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.PointsMaterial
  private readonly lifetime: number
  private elapsed = 0

  constructor(
    centerX: number,
    centerY: number,
    centerZ: number,
    count: number,
    size: number,
    color: number,
    lifetime: number,
    driftSpeed: number,
    spread: number
  ) {
    this.lifetime = lifetime

    this.geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      this.positions[i3] = centerX + (Math.random() - 0.5) * spread
      this.positions[i3 + 1] = centerY + (Math.random() - 0.5) * spread * 0.5
      this.positions[i3 + 2] = centerZ + (Math.random() - 0.5) * spread

      // Strong upward jet with slight horizontal scatter
      this.velocities[i3] = (Math.random() - 0.5) * 1.5
      this.velocities[i3 + 1] = driftSpeed * (0.6 + Math.random() * 0.8)
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 1.5
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    this.material = new THREE.PointsMaterial({
      color: color,
      size: size,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(this.geometry, this.material)
  }

  /**
   * @returns true when expired and ready for removal
   */
  update(deltaTime: number): boolean {
    this.elapsed += deltaTime

    for (let i = 0; i < this.positions.length / 3; i++) {
      const i3 = i * 3
      this.positions[i3] += this.velocities[i3] * deltaTime
      this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime
      this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime
    }

    this.geometry.attributes.position.needsUpdate = true

    // Fade out in the last 40% of lifetime
    const fadeStart = this.lifetime * 0.6
    if (this.elapsed > fadeStart) {
      const fadeProgress = (this.elapsed - fadeStart) / (this.lifetime - fadeStart)
      this.material.opacity = 1 - fadeProgress
    }

    return this.elapsed >= this.lifetime
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
