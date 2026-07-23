import * as THREE from 'three'

/**
 * Singleton manager for smoldering stone smoke wisps.
 * Each wisp is a tiny cluster of 1-3 grey smoke particles that rises slowly
 * off a SMOLDERING_STONE block, drifts a little sideways, and fades out.
 *
 * Follows the GeyserParticleManager pattern (plain THREE.Points +
 * PointsMaterial - no custom shaders, safe under the WebGPU renderer).
 *
 * A hard cap on total live particles keeps a caldera rim full of smoldering
 * blocks from flooding the scene: spawns are silently dropped at the cap.
 *
 * @example
 * ```typescript
 * // Initialize once at startup
 * SmolderingSmokeParticleManager.instance.initialize(renderer.scene)
 *
 * // Spawn a wisp above a smoldering block (block-top world position)
 * SmolderingSmokeParticleManager.instance.spawnWisp(x, y, z)
 *
 * // Update each frame
 * SmolderingSmokeParticleManager.instance.update(deltaTime)
 * ```
 */
export class SmolderingSmokeParticleManager {
  private static _instance: SmolderingSmokeParticleManager | null = null

  private scene: THREE.Scene | null = null
  private readonly wisps: SmokeWisp[] = []
  private liveParticleCount = 0

  /** Hard cap on simultaneously live smoke particles across all wisps. Large:
   * a tall plume made of long-lived particles needs a big pool to look dense. */
  private static readonly MAX_PARTICLES = 700

  private static readonly WISP_MIN_COUNT = 2
  private static readonly WISP_MAX_COUNT = 4
  /** Big billboards so the plume is legible from far away (the whole point of
   * volcano smoke); sizeAttenuation still shrinks them up close. */
  private static readonly WISP_SIZE = 1.6
  private static readonly WISP_COLOR = 0x9a9a9a // Soft smoke grey
  /** Long life so each particle climbs many blocks, building a tall column
   * that stays visible against the sky from a distance. */
  private static readonly MIN_LIFETIME = 5.0 // seconds
  private static readonly MAX_LIFETIME = 9.0
  private static readonly MIN_RISE = 1.6 // blocks per second upward
  private static readonly MAX_RISE = 2.8
  private static readonly SPAWN_SPREAD = 0.7 // horizontal scatter over the block

  private constructor() {
    // Private constructor for singleton
  }

  static get instance(): SmolderingSmokeParticleManager {
    if (!SmolderingSmokeParticleManager._instance) {
      SmolderingSmokeParticleManager._instance = new SmolderingSmokeParticleManager()
    }
    return SmolderingSmokeParticleManager._instance
  }

  /**
   * Initializes the manager with a scene reference.
   * Must be called before spawning any particles.
   */
  initialize(scene: THREE.Scene): void {
    this.scene = scene
  }

  /**
   * Spawns a slow smoke wisp at the given world position (block top).
   * Silently dropped when the global particle cap is reached.
   */
  spawnWisp(x: number, y: number, z: number): void {
    if (!this.scene) {
      return
    }

    const count = SmolderingSmokeParticleManager.WISP_MIN_COUNT + Math.floor(
      Math.random() *
      (SmolderingSmokeParticleManager.WISP_MAX_COUNT -
        SmolderingSmokeParticleManager.WISP_MIN_COUNT + 1)
    )
    if (this.liveParticleCount + count > SmolderingSmokeParticleManager.MAX_PARTICLES) {
      return
    }

    const lifetime = SmolderingSmokeParticleManager.MIN_LIFETIME + Math.random() *
      (SmolderingSmokeParticleManager.MAX_LIFETIME - SmolderingSmokeParticleManager.MIN_LIFETIME)

    const wisp = new SmokeWisp(
      x, y, z,
      count,
      SmolderingSmokeParticleManager.WISP_SIZE,
      SmolderingSmokeParticleManager.WISP_COLOR,
      lifetime,
      SmolderingSmokeParticleManager.MIN_RISE,
      SmolderingSmokeParticleManager.MAX_RISE,
      SmolderingSmokeParticleManager.SPAWN_SPREAD
    )

    this.wisps.push(wisp)
    this.liveParticleCount += count
    this.scene.add(wisp.points)
  }

  /**
   * Updates all wisps and removes expired ones. Call each frame.
   */
  update(deltaTime: number): void {
    if (!this.scene) {
      return
    }

    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const wisp = this.wisps[i]
      if (wisp.update(deltaTime)) {
        this.scene.remove(wisp.points)
        this.liveParticleCount -= wisp.count
        wisp.dispose()
        this.wisps.splice(i, 1)
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

    for (const wisp of this.wisps) {
      this.scene.remove(wisp.points)
      wisp.dispose()
    }
    this.wisps.length = 0
    this.liveParticleCount = 0
  }
}

/**
 * One slow-rising smoke wisp (same mechanics as GeyserParticleManager's
 * ParticleBurst, tuned for gentle drift instead of a jet).
 */
class SmokeWisp {
  readonly points: THREE.Points
  readonly count: number
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
    minRise: number,
    maxRise: number,
    spread: number
  ) {
    this.count = count
    this.lifetime = lifetime

    this.geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      this.positions[i3] = centerX + (Math.random() - 0.5) * spread
      this.positions[i3 + 1] = centerY + Math.random() * 0.25
      this.positions[i3 + 2] = centerZ + (Math.random() - 0.5) * spread

      // Rise with a sideways drift that widens the column as it climbs
      this.velocities[i3] = (Math.random() - 0.5) * 0.5
      this.velocities[i3 + 1] = minRise + Math.random() * (maxRise - minRise)
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.5
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    this.material = new THREE.PointsMaterial({
      color: color,
      size: size,
      transparent: true,
      opacity: 0.55, // Translucent so overlapping big billboards read as soft smoke
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

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      this.positions[i3] += this.velocities[i3] * deltaTime
      this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime
      this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime
    }

    this.geometry.attributes.position.needsUpdate = true

    // Fade out over the last 60% of lifetime
    const fadeStart = this.lifetime * 0.4
    if (this.elapsed > fadeStart) {
      const fadeProgress = (this.elapsed - fadeStart) / (this.lifetime - fadeStart)
      this.material.opacity = 0.55 * Math.max(0, 1 - fadeProgress)
    }

    return this.elapsed >= this.lifetime
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
