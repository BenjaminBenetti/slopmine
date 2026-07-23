import * as THREE from 'three'

/**
 * Singleton manager for TNT explosion particles.
 * An explosion spawns three radial bursts at the blast center: a bright orange
 * fireball flash, darker grey smoke, and small brown debris chips, all flying
 * outward and fading.
 *
 * Follows the GeyserParticleManager pattern (plain THREE.Points +
 * PointsMaterial - no custom shaders, safe under the WebGPU renderer).
 *
 * @example
 * ```typescript
 * // Initialize once at startup
 * ExplosionParticleManager.instance.initialize(renderer.scene)
 *
 * // Spawn a blast (explosion center world position)
 * ExplosionParticleManager.instance.spawnExplosion(x, y, z)
 *
 * // Small grey puff for a burning fuse (block-top world position)
 * ExplosionParticleManager.instance.spawnFuseSmoke(x, y, z)
 *
 * // Update each frame
 * ExplosionParticleManager.instance.update(deltaTime)
 * ```
 */
export class ExplosionParticleManager {
  private static _instance: ExplosionParticleManager | null = null

  private scene: THREE.Scene | null = null
  private readonly bursts: RadialBurst[] = []

  // Fireball flash
  private static readonly FIRE_COUNT = 40
  private static readonly FIRE_SIZE = 0.45
  private static readonly FIRE_COLOR = 0xff8c2a // Hot orange
  private static readonly FIRE_LIFETIME = 0.5 // seconds
  private static readonly FIRE_SPEED = 10.0 // blocks per second outward

  // Smoke cloud
  private static readonly SMOKE_COUNT = 35
  private static readonly SMOKE_SIZE = 0.55
  private static readonly SMOKE_COLOR = 0x6b6b6b // Dark grey
  private static readonly SMOKE_LIFETIME = 1.4
  private static readonly SMOKE_SPEED = 6.0

  // Debris chips
  private static readonly DEBRIS_COUNT = 25
  private static readonly DEBRIS_SIZE = 0.18
  private static readonly DEBRIS_COLOR = 0x8a6a4a // Dusty brown
  private static readonly DEBRIS_LIFETIME = 0.9
  private static readonly DEBRIS_SPEED = 13.0

  // Fuse smoke puff
  private static readonly FUSE_COUNT = 4
  private static readonly FUSE_SIZE = 0.14
  private static readonly FUSE_COLOR = 0xb0aca4 // Pale grey
  private static readonly FUSE_LIFETIME = 0.6
  private static readonly FUSE_SPEED = 1.2

  private constructor() {
    // Private constructor for singleton
  }

  static get instance(): ExplosionParticleManager {
    if (!ExplosionParticleManager._instance) {
      ExplosionParticleManager._instance = new ExplosionParticleManager()
    }
    return ExplosionParticleManager._instance
  }

  /**
   * Initializes the manager with a scene reference.
   * Must be called before spawning any particles.
   */
  initialize(scene: THREE.Scene): void {
    this.scene = scene
  }

  /**
   * Spawns a fireball/smoke/debris burst at the given world position.
   */
  spawnExplosion(x: number, y: number, z: number): void {
    if (!this.scene) {
      return
    }

    const M = ExplosionParticleManager
    this.addBurst(new RadialBurst(x, y, z, M.FIRE_COUNT, M.FIRE_SIZE, M.FIRE_COLOR, M.FIRE_LIFETIME, M.FIRE_SPEED, 0))
    this.addBurst(new RadialBurst(x, y, z, M.SMOKE_COUNT, M.SMOKE_SIZE, M.SMOKE_COLOR, M.SMOKE_LIFETIME, M.SMOKE_SPEED, 1.5))
    this.addBurst(new RadialBurst(x, y, z, M.DEBRIS_COUNT, M.DEBRIS_SIZE, M.DEBRIS_COLOR, M.DEBRIS_LIFETIME, M.DEBRIS_SPEED, -6.0))
  }

  /**
   * Spawns a small grey puff above an ignited TNT block (fuse feedback).
   */
  spawnFuseSmoke(x: number, y: number, z: number): void {
    if (!this.scene) {
      return
    }

    const M = ExplosionParticleManager
    this.addBurst(new RadialBurst(x, y, z, M.FUSE_COUNT, M.FUSE_SIZE, M.FUSE_COLOR, M.FUSE_LIFETIME, M.FUSE_SPEED, 2.2))
  }

  private addBurst(burst: RadialBurst): void {
    this.bursts.push(burst)
    this.scene!.add(burst.points)
  }

  /**
   * Updates all bursts and removes expired ones. Call each frame.
   */
  update(deltaTime: number): void {
    if (!this.scene) {
      return
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]
      if (burst.update(deltaTime)) {
        this.scene.remove(burst.points)
        burst.dispose()
        this.bursts.splice(i, 1)
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

    for (const burst of this.bursts) {
      this.scene.remove(burst.points)
      burst.dispose()
    }
    this.bursts.length = 0
  }
}

/**
 * One radial burst of particles: random directions from the center, constant
 * outward velocity plus a vertical drift (positive = rises, negative = falls
 * like debris), fading out over the last 40% of its lifetime.
 */
class RadialBurst {
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
    speed: number,
    verticalDrift: number
  ) {
    this.lifetime = lifetime

    this.geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Random direction on the unit sphere
      const theta = Math.random() * Math.PI * 2
      const cosPhi = Math.random() * 2 - 1
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
      const dx = sinPhi * Math.cos(theta)
      const dy = cosPhi
      const dz = sinPhi * Math.sin(theta)

      this.positions[i3] = centerX + dx * 0.3
      this.positions[i3 + 1] = centerY + dy * 0.3
      this.positions[i3 + 2] = centerZ + dz * 0.3

      const s = speed * (0.4 + Math.random() * 0.8)
      this.velocities[i3] = dx * s
      this.velocities[i3 + 1] = dy * s + verticalDrift
      this.velocities[i3 + 2] = dz * s
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
      // Outward motion decays so the cloud hangs rather than flying forever
      this.velocities[i3] *= 1 - 2.0 * deltaTime
      this.velocities[i3 + 2] *= 1 - 2.0 * deltaTime
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
