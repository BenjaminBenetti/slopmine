import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'

/**
 * A patch of the Pyre Tyrant's fire on the arena floor. Three optional
 * stages, in order:
 * 1. warning: a pulsing ring marks the spot (no damage) - the telegraph
 * 2. eruption: a lava burst shoots up; the player within the radius takes
 *    `eruptDamage` ('magic': armour and fire resistance don't help) once
 *    and is thrown up
 * 3. burning: flames lick the ground; the player standing in it takes
 *    `burnDamage` (fire) every BURN_TICK seconds
 *
 * Visual-only world presence: no physics body, no world edits (the arena
 * is never damaged), removed when done. Spawned as a guardian minion so the
 * guardian's death or reset clears it.
 */
export interface FirePatchOptions {
  position: THREE.Vector3
  /** Radius (blocks) of the warning ring, the burst and the burning ground. */
  radius: number
  /** Telegraph time before the burst. 0 = no warning and no burst. */
  warnTime?: number
  /** Burst damage (fire). 0 = no burst. */
  eruptDamage?: number
  /** Burning ground duration after the burst (or from the start). 0 = none. */
  burnTime?: number
  /** Damage per burn tick (fire). */
  burnDamage?: number
}

/** Seconds between burning-ground damage ticks. */
const BURN_TICK = 0.6
/** Feet within this height of the patch count as standing in it. */
const STAND_HEIGHT = 1.4
/** How long the lava burst column stays visible. */
const BURST_TIME = 0.7
const BURST_HEIGHT = 4.5

// Geometries are built per patch: Entity.dispose() disposes everything in
// its mesh, so sharing them between patches would churn GPU uploads.
function ringGeometry(): THREE.BufferGeometry {
  return new THREE.RingGeometry(0.82, 1, 28, 1).rotateX(-Math.PI / 2)
}
function discGeometry(): THREE.BufferGeometry {
  return new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)
}
function boxGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)
}

export class FirePatchEntity extends Entity {
  readonly type = 'pyre_fire_patch'

  private readonly radius: number
  private readonly warnTime: number
  private readonly eruptDamage: number
  private readonly burnTime: number
  private readonly burnDamage: number

  private age = 0
  private erupted = false
  private burnTick = 0

  private playerRef: THREE.Vector3 | null = null
  private damageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null
  private readonly knockback = new THREE.Vector3()

  // Visual parts (own materials: they animate per patch)
  private ring: THREE.Mesh | null = null
  private ringMaterial: THREE.MeshBasicMaterial | null = null
  private ground: THREE.Mesh | null = null
  private groundMaterial: THREE.MeshBasicMaterial | null = null
  private flames: THREE.Mesh[] = []
  private flameMaterial: THREE.MeshBasicMaterial | null = null
  private burst: THREE.Mesh | null = null
  private burstMaterial: THREE.MeshBasicMaterial | null = null
  private readonly flamePhase = Math.random() * Math.PI * 2

  constructor(options: FirePatchOptions) {
    super('pyre_fire_patch', { position: options.position, hasPhysics: false })
    this.radius = options.radius
    this.warnTime = options.warnTime ?? 0
    this.eruptDamage = options.eruptDamage ?? 0
    this.burnTime = options.burnTime ?? 0
    this.burnDamage = options.burnDamage ?? 0
    if (this.warnTime <= 0) this.erupted = true
  }

  /** Total lifetime in seconds. */
  get duration(): number {
    return this.warnTime + this.burnTime + (this.warnTime > 0 ? BURST_TIME * 0.5 : 0)
  }

  // EntityManager wiring (duck-typed)
  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    this.damageCallback = callback
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()
    const r = this.radius

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    })
    this.ring = new THREE.Mesh(ringGeometry(), this.ringMaterial)
    this.ring.scale.setScalar(r)
    this.ring.position.y = 0.04
    this.ring.renderOrder = 2
    group.add(this.ring)

    this.groundMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4a10, transparent: true, opacity: 0, depthWrite: false,
    })
    this.ground = new THREE.Mesh(discGeometry(), this.groundMaterial)
    this.ground.scale.setScalar(r * 0.95)
    this.ground.position.y = 0.03
    this.ground.renderOrder = 2
    group.add(this.ground)

    this.flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb43c, transparent: true, opacity: 0.9 })
    const count = Math.max(3, Math.round(r * r * 2.2))
    const flameGeometry = boxGeometry(0.22, 0.6, 0.22)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6
      const dist = Math.sqrt(Math.random()) * r * 0.85
      const flame = new THREE.Mesh(flameGeometry, this.flameMaterial)
      flame.position.set(Math.sin(angle) * dist, 0, Math.cos(angle) * dist)
      flame.visible = false
      group.add(flame)
      this.flames.push(flame)
    }

    this.burstMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.95 })
    this.burst = new THREE.Mesh(boxGeometry(1, 1, 1), this.burstMaterial)
    this.burst.scale.set(r * 1.3, 0.01, r * 1.3)
    this.burst.visible = false
    group.add(this.burst)

    return group
  }

  update(deltaTime: number): void {
    if (!this.isAlive) return
    this.age += deltaTime
    const t = this.age

    if (!this.erupted && t >= this.warnTime) {
      this.erupted = true
      this.erupt()
    }

    const burnStart = this.warnTime
    const burning = this.burnTime > 0 && t >= burnStart && t < burnStart + this.burnTime
    if (burning && this.burnDamage > 0) {
      this.burnTick -= deltaTime
      if (this.burnTick <= 0 && this.isPlayerInside()) {
        this.burnTick = BURN_TICK
        this.hitPlayer(this.burnDamage, 0)
      }
    }

    this.animate(t, burning)

    if (t >= this.duration) this.kill()

    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
  }

  private erupt(): void {
    // Molten rock thrown up by the guardian's sorcery: 'magic' - neither
    // armour nor fire resistance stops it, only stepping out of the ring
    if (this.eruptDamage > 0 && this.isPlayerInside(2.5)) {
      this.hitPlayer(this.eruptDamage, 7, 'magic')
    }
  }

  private isPlayerInside(height = STAND_HEIGHT): boolean {
    const player = this.playerRef
    if (!player) return false
    const dx = player.x - this.position.x
    const dz = player.z - this.position.z
    if (dx * dx + dz * dz > this.radius * this.radius) return false
    const dy = player.y - this.position.y
    return dy > -0.6 && dy < height
  }

  private hitPlayer(damage: number, lift: number, source: DamageSource = 'fire'): void {
    if (!this.damageCallback || !this.playerRef) return
    this.knockback.set(this.playerRef.x - this.position.x, 0, this.playerRef.z - this.position.z)
    if (this.knockback.lengthSq() > 1e-6) this.knockback.normalize().multiplyScalar(lift * 0.4)
    this.knockback.y = lift
    this.damageCallback(damage, this.knockback, source)
  }

  private animate(t: number, burning: boolean): void {
    // Warning ring: pulses faster and brighter as the burst nears
    if (this.ring && this.ringMaterial) {
      if (!this.erupted && this.warnTime > 0) {
        const k = t / this.warnTime
        const pulse = 0.5 + 0.5 * Math.sin(t * (10 + 18 * k))
        this.ringMaterial.opacity = 0.35 + 0.55 * k * (0.6 + 0.4 * pulse)
        this.ring.scale.setScalar(this.radius * (1.15 - 0.15 * k))
        this.ring.visible = true
      } else {
        this.ring.visible = false
      }
    }
    // Ground glow: under the warning (faint) and while burning
    if (this.groundMaterial) {
      const end = this.warnTime + this.burnTime
      const fadeOut = burning ? Math.min(1, (end - t) / 0.8) : 0
      const warn = !this.erupted && this.warnTime > 0 ? 0.15 * (t / this.warnTime) : 0
      this.groundMaterial.opacity = Math.max(warn, burning ? 0.55 * fadeOut : 0)
    }
    // Flames while burning
    for (let i = 0; i < this.flames.length; i++) {
      const flame = this.flames[i]
      flame.visible = burning
      if (burning) {
        const s = 0.7 + 0.45 * Math.sin(t * 11 + i * 1.7 + this.flamePhase)
        flame.scale.set(1, s, 1)
      }
    }
    // Lava burst column
    if (this.burst && this.burstMaterial && this.warnTime > 0) {
      const since = t - this.warnTime
      if (since >= 0 && since < BURST_TIME) {
        const k = since / BURST_TIME
        this.burst.visible = true
        this.burst.scale.y = BURST_HEIGHT * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * 0.6)
        this.burstMaterial.opacity = 0.95 * (1 - k * k)
      } else {
        this.burst.visible = false
      }
    }
  }

  dispose(): void {
    this.flames = []
    this.ring = null
    this.ground = null
    this.burst = null
    this.playerRef = null
    this.damageCallback = null
    super.dispose()
  }
}
