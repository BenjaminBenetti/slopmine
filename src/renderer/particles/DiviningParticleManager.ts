import * as THREE from 'three'

/**
 * Singleton manager for divining stick cave detection particles.
 * Spawns small green blocky particles that drift upward and fade.
 *
 * @example
 * ```typescript
 * // Initialize once at startup
 * DiviningParticleManager.instance.initialize(renderer.scene)
 *
 * // Spawn particles at divining stick position when cave detected
 * DiviningParticleManager.instance.spawn(worldX, worldY, worldZ)
 *
 * // Update each frame
 * DiviningParticleManager.instance.update(deltaTime)
 * ```
 */
export class DiviningParticleManager {
  private static _instance: DiviningParticleManager | null = null

  private scene: THREE.Scene | null = null
  private readonly particleSystems: ParticleSystem[] = []

  // Particle constants
  private static readonly PARTICLE_COUNT = 12
  private static readonly PARTICLE_SIZE = 0.08
  private static readonly PARTICLE_COLOR = 0x00ff00 // Bright green
  private static readonly PARTICLE_LIFETIME = 0.8 // seconds
  private static readonly DRIFT_SPEED = 1.5 // blocks per second upward
  private static readonly SPREAD = 0.3 // horizontal spread

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance.
   */
  static get instance(): DiviningParticleManager {
    if (!DiviningParticleManager._instance) {
      DiviningParticleManager._instance = new DiviningParticleManager()
    }
    return DiviningParticleManager._instance
  }

  /**
   * Initializes the manager with a scene reference.
   * Must be called before spawning any particles.
   * @param scene The Three.js scene to add particles to
   */
  initialize(scene: THREE.Scene): void {
    this.scene = scene
  }

  /**
   * Spawns a burst of green particles at the given world position.
   * @param x World X coordinate
   * @param y World Y coordinate
   * @param z World Z coordinate
   */
  spawn(x: number, y: number, z: number): void {
    if (!this.scene) {
      console.warn('DiviningParticleManager not initialized')
      return
    }

    const system = new ParticleSystem(
      x,
      y,
      z,
      DiviningParticleManager.PARTICLE_COUNT,
      DiviningParticleManager.PARTICLE_SIZE,
      DiviningParticleManager.PARTICLE_COLOR,
      DiviningParticleManager.PARTICLE_LIFETIME,
      DiviningParticleManager.DRIFT_SPEED,
      DiviningParticleManager.SPREAD
    )

    this.particleSystems.push(system)
    this.scene.add(system.points)
  }

  /**
   * Updates all particle systems and removes expired ones.
   * Should be called each frame.
   * @param deltaTime Time elapsed in seconds
   */
  update(deltaTime: number): void {
    if (!this.scene) {
      return
    }

    // Update systems and collect expired ones
    for (let i = this.particleSystems.length - 1; i >= 0; i--) {
      const system = this.particleSystems[i]
      const expired = system.update(deltaTime)

      if (expired) {
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

  /**
   * Gets the current number of active particle systems.
   */
  get count(): number {
    return this.particleSystems.length
  }
}

/**
 * A single particle system representing one burst of particles.
 */
class ParticleSystem {
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

    // Create geometry
    this.geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)

    // Initialize particles with random positions and velocities
    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Start at center with small random offset
      this.positions[i3] = centerX + (Math.random() - 0.5) * spread
      this.positions[i3 + 1] = centerY + (Math.random() - 0.5) * spread
      this.positions[i3 + 2] = centerZ + (Math.random() - 0.5) * spread

      // Upward drift with slight horizontal spread
      this.velocities[i3] = (Math.random() - 0.5) * 0.5
      this.velocities[i3 + 1] = driftSpeed + Math.random() * 0.5
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.5
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    // Create material - blocky square particles
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
   * Updates the particle system.
   * @param deltaTime Time elapsed in seconds
   * @returns true if the system has expired and should be removed
   */
  update(deltaTime: number): boolean {
    this.elapsed += deltaTime

    // Update positions
    for (let i = 0; i < this.positions.length / 3; i++) {
      const i3 = i * 3
      this.positions[i3] += this.velocities[i3] * deltaTime
      this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime
      this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime
    }

    // Mark positions as needing update
    this.geometry.attributes.position.needsUpdate = true

    // Fade out in the last 30% of lifetime
    const fadeStart = this.lifetime * 0.7
    if (this.elapsed > fadeStart) {
      const fadeProgress = (this.elapsed - fadeStart) / (this.lifetime - fadeStart)
      this.material.opacity = 1 - fadeProgress
    }

    return this.elapsed >= this.lifetime
  }

  /**
   * Disposes of GPU resources.
   */
  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
