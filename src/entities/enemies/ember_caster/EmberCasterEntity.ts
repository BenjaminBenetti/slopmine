import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import { MagmaCreamItem } from '../../../items/materials/magma_cream/MagmaCreamItem.ts'
import { SulfurItem } from '../../../items/ores/sulfur/SulfurItem.ts'
import { EmberRoachWingItem } from '../../../items/materials/ember_roach_wing/EmberRoachWingItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Charcoal robe with crimson trim, ember eyes, a floating fire orb
const ROBE = 0x231c1c
const ROBE_DARK = 0x150f10
const TRIM = 0x7a1a14
const GOLD = 0x8a6418
const EYES = 0xffc23a
const ORB = 0xff7a24
const ORB_HOT = 0xffe7a0

const S = 0.0625

// Casting
const FIREBALL_DAMAGE = 7
const FIREBALL_SPEED = 14
const CAST_WINDUP = 0.9
const CAST_RECOVERY = 0.45
const FAN_EVERY = 3
const FAN_SPREAD = 0.28
/** Preferred distance band to the player. */
const KEEP_AWAY = 6
const CAST_RANGE = 14

// Blink (teleport away when cornered)
const BLINK_TRIGGER = 3.2
const BLINK_WINDUP = 0.45
const BLINK_COOLDOWN = 7
const BLINK_MIN = 6
const BLINK_MAX = 9

type CasterAction = 'cast' | 'cast-recover' | 'blink'

/**
 * Ember Caster - a hooded fire-cultist of the Infernal Bastion (dungeon
 * garrison only). Keeps its distance: it backs away from a closing player
 * and, when cornered, flares and blinks 6-9 blocks away. With line of sight
 * it charges the fire orb between its hands (0.9 s, the orb swells and
 * whitens) and hurls a fireball (7); every third cast is a fan of three.
 *
 * 24 HP. Drops magma cream, sulfur and sometimes an ember roach wing.
 */
export class EmberCasterEntity extends AggressiveEntity {
  readonly type = 'ember_caster'

  private action: CasterAction | null = null
  private actionTime = 0
  private castCount = 0
  private blinkCooldown = 2
  private readonly bolts: ProjectileEntity[] = []

  private targetRef: THREE.Vector3 | null = null
  private spawnFn: ((entity: IEntity) => boolean) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  // Animation
  private bobPhase = Math.random() * Math.PI * 2
  private orb: THREE.Object3D | null = null
  private orbMaterial: THREE.MeshBasicMaterial | null = null
  private arms: THREE.Object3D[] = []
  private robe: THREE.Object3D | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null

  private readonly tmp = new THREE.Vector3()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('ember_caster', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 2.0, 0.7),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 24,
      attackDamage: FIREBALL_DAMAGE,
      // The base AI walks in until this range, then "attacks" = casts
      attackRange: CAST_RANGE - 2,
      attackCooldown: 2.0,
      detectionRange: 22,
      chaseSpeed: 3.2,
      walkSpeed: 1.8,
      jumpVelocity: 8,
      drops: [
        { createItem: () => new MagmaCreamItem(), minCount: 0, maxCount: 1 },
        { createItem: () => new SulfurItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new EmberRoachWingItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  /** Fireballs still in flight (cleared with an owning guardian/garrison). */
  get spawnedChildren(): readonly IEntity[] {
    for (let i = this.bolts.length - 1; i >= 0; i--) if (!this.bolts[i].isAlive) this.bolts.splice(i, 1)
    return this.bolts
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.targetRef = positionRef
  }

  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.spawnFn = spawn
  }

  setWorldQueryFns(_blockQuery: (x: number, y: number, z: number) => number, solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.solidQuery = solidQuery
  }

  /** The base AI wants to attack: begin a cast if the player can be seen. */
  protected override performAttack(): void {
    if (this.action || !this.canSeeTarget()) return
    this.startAction('cast')
  }

  private startAction(action: CasterAction | null): void {
    this.action = action
    this.actionTime = 0
  }

  private orbWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.getMesh()?.rotation.y ?? 0
    return out.set(this.position.x + Math.sin(yaw) * 0.55, this.position.y + 1.35, this.position.z + Math.cos(yaw) * 0.55)
  }

  private canSeeTarget(): boolean {
    const target = this.targetRef
    if (!target) return false
    if (!this.solidQuery) return true
    const from = this.orbWorldPosition(this.tmp)
    const tx = target.x
    const ty = target.y + 1.5
    const tz = target.z
    const dist = Math.hypot(tx - from.x, ty - from.y, tz - from.z)
    const steps = Math.ceil(dist / 0.5)
    for (let i = 1; i < steps; i++) {
      const k = i / steps
      if (this.solidQuery(
        Math.floor(from.x + (tx - from.x) * k),
        Math.floor(from.y + (ty - from.y) * k),
        Math.floor(from.z + (tz - from.z) * k)
      )) return false
    }
    return true
  }

  override update(deltaTime: number): void {
    super.update(deltaTime)
    if (this._isDying || !this.isAlive) {
      this.action = null
      return
    }
    this.blinkCooldown = Math.max(0, this.blinkCooldown - deltaTime)
    const body = this.getPhysicsBody()
    const target = this.targetRef
    if (!body || !target || !this.isAggressive) return
    if (this.knockbackTimer > 0) {
      if (this.action === 'cast') this.startAction(null) // interrupted
      return
    }

    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    const dist = Math.hypot(dx, dz)
    const mesh = this.getMesh()
    this.actionTime += deltaTime

    switch (this.action) {
      case 'cast':
        this.stop(body)
        if (mesh && dist > 1e-3) mesh.rotation.y = Math.atan2(dx, dz)
        if (this.actionTime >= CAST_WINDUP) {
          this.cast()
          this.startAction('cast-recover')
        }
        return
      case 'cast-recover':
        this.stop(body)
        if (this.actionTime >= CAST_RECOVERY) this.startAction(null)
        return
      case 'blink':
        this.stop(body)
        if (this.actionTime >= BLINK_WINDUP) {
          this.blink(dx, dz, dist)
          this.startAction(null)
        }
        return
    }

    // Cornered: flare and blink away
    if (dist < BLINK_TRIGGER && this.blinkCooldown <= 0) {
      this.blinkCooldown = BLINK_COOLDOWN
      this.startAction('blink')
      return
    }
    // Too close: back away (still facing the player)
    if (dist < KEEP_AWAY && dist > 1e-3) {
      body.velocity.x = (-dx / dist) * this.walkSpeed * 1.5
      body.velocity.z = (-dz / dist) * this.walkSpeed * 1.5
      this.isWalking = true
      if (mesh) mesh.rotation.y = Math.atan2(dx, dz)
      return
    }
    // In range but no line of sight: close in to find an angle
    if (dist <= CAST_RANGE && !this.canSeeTarget() && dist > 1e-3) {
      body.velocity.x = (dx / dist) * this.chaseSpeed
      body.velocity.z = (dz / dist) * this.chaseSpeed
      this.isWalking = true
    }
  }

  private stop(body: { velocity: THREE.Vector3 }): void {
    body.velocity.x = 0
    body.velocity.z = 0
    this.isWalking = false
  }

  private cast(): void {
    const target = this.targetRef
    if (!target || !this.spawnFn) return
    this.castCount++
    const fan = this.castCount % FAN_EVERY === 0
    const from = this.orbWorldPosition(new THREE.Vector3())
    const aim = new THREE.Vector3(target.x, target.y + 1.1, target.z).sub(from)
    const horizontal = Math.hypot(aim.x, aim.z)
    const baseYaw = Math.atan2(aim.x, aim.z)
    const pitch = Math.atan2(aim.y, Math.max(horizontal, 1e-3))
    const offsets = fan ? [-FAN_SPREAD, 0, FAN_SPREAD] : [0]
    for (const offset of offsets) {
      const yaw = baseYaw + offset
      const velocity = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch) * FIREBALL_SPEED,
        Math.sin(pitch) * FIREBALL_SPEED,
        Math.cos(yaw) * Math.cos(pitch) * FIREBALL_SPEED
      )
      const bolt = new ProjectileEntity({
        position: from.clone(),
        velocity,
        damage: FIREBALL_DAMAGE,
        owner: this,
        preset: 'fireball',
        scale: 0.85,
        knockback: 2.5,
      })
      if (this.spawnFn(bolt)) this.bolts.push(bolt)
    }
  }

  /** Teleport to a standable spot 6-9 blocks from the player, away from it. */
  private blink(dx: number, dz: number, dist: number): void {
    const target = this.targetRef
    const body = this.getPhysicsBody()
    if (!target || !body || !this.solidQuery) return
    const away = dist > 1e-3 ? Math.atan2(-dx, -dz) : Math.random() * Math.PI * 2
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = away + (attempt % 2 === 0 ? 1 : -1) * Math.ceil(attempt / 2) * 0.45
      const r = BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN)
      const x = target.x + Math.sin(angle) * r
      const z = target.z + Math.cos(angle) * r
      const fx = Math.floor(x)
      const fz = Math.floor(z)
      // Ground within 3 blocks of the caster's level, two free cells above it
      for (let dy = 2; dy >= -3; dy--) {
        const y = Math.floor(this.position.y) + dy
        if (this.solidQuery(fx, y - 1, fz) && !this.solidQuery(fx, y, fz) && !this.solidQuery(fx, y + 1, fz)) {
          body.position.set(fx + 0.5, y + 0.01, fz + 0.5)
          body.velocity.set(0, 0, 0)
          this.position.copy(body.position)
          return
        }
      }
    }
  }

  // ===========================================================================
  // Model
  // ===========================================================================

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const robe = new THREE.MeshLambertMaterial({ color: ROBE })
    const robeDark = new THREE.MeshLambertMaterial({ color: ROBE_DARK })
    const trim = new THREE.MeshLambertMaterial({ color: TRIM })
    const gold = new THREE.MeshLambertMaterial({ color: GOLD })
    for (const m of [robe, robeDark, trim, gold]) this.registerMaterialForLighting(m)
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYES })
    this.orbMaterial = new THREE.MeshBasicMaterial({ color: ORB })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // A tall tapering robe (no visible legs): it seems to glide
    const body = new THREE.Group()
    root.add(body)
    this.robe = body
    box(9 * S, 6 * S, 9 * S, robeDark, 0, 3 * S, 0, body) // hem
    box(8 * S, 8 * S, 7 * S, robe, 0, 10 * S, 0, body)
    box(7 * S, 9 * S, 6 * S, robe, 0, 18.5 * S, 0, body) // chest
    box(1.4 * S, 22 * S, 0.4 * S, trim, 0, 12 * S, 3.6 * S, body) // front trim
    box(9.4 * S, 1 * S, 9.4 * S, trim, 0, 5.8 * S, 0, body)
    box(7.4 * S, 1 * S, 6.4 * S, gold, 0, 14 * S, 0, body) // sash
    // Horned hood with a dark face and ember eyes
    box(7 * S, 7 * S, 7 * S, robe, 0, 26 * S, -0.3 * S, body)
    box(5 * S, 4.5 * S, 0.4 * S, robeDark, 0, 25.5 * S, 3.3 * S, body) // shadowed face
    const eyes = box(3.6 * S, 0.9 * S, 0.3 * S, this.eyeMaterial, 0, 26 * S, 3.6 * S, body)
    eyes.castShadow = false
    box(3 * S, 3 * S, 4 * S, robe, 0, 30.5 * S, -1.5 * S, body) // hood peak
    for (const side of [-1, 1]) {
      const horn = box(1.2 * S, 4 * S, 1.2 * S, gold, side * 3.6 * S, 30 * S, -0.5 * S, body)
      horn.rotation.z = -side * 0.6
    }
    // Wide sleeves (arms) reaching toward the orb
    this.arms = []
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      arm.position.set(side * 4.5 * S, 22 * S, 0)
      body.add(arm)
      box(3 * S, 9 * S, 3 * S, robe, 0, -4.5 * S, 0, arm)
      box(3.6 * S, 1 * S, 3.6 * S, trim, 0, -8.6 * S, 0, arm)
      arm.rotation.x = -0.9
      arm.rotation.z = side * 0.25
      this.arms.push(arm)
    }
    // The fire orb hovering between the hands
    const orb = new THREE.Group()
    orb.position.set(0, 21.5 * S, 8.5 * S)
    body.add(orb)
    const core = box(3.2 * S, 3.2 * S, 3.2 * S, this.orbMaterial, 0, 0, 0, orb)
    core.castShadow = false
    const shell = box(4.6 * S, 4.6 * S, 4.6 * S, new THREE.MeshBasicMaterial({ color: ORB, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, orb)
    shell.castShadow = false
    shell.rotation.set(0.6, 0.6, 0)
    this.orb = orb

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, ...this.arms, orb],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  protected updateAnimations(deltaTime: number): void {
    this.bobPhase += deltaTime * 2.2
    if (this.robe) this.robe.position.y = 0.05 + Math.sin(this.bobPhase) * 0.04

    let orbScale = 1
    let orbHeat = 0
    let armLift = -0.9
    if (this.action === 'cast') {
      const k = Math.min(1, this.actionTime / CAST_WINDUP)
      orbScale = 1 + 0.9 * k
      orbHeat = k
      armLift = -0.9 - 0.7 * k
    } else if (this.action === 'cast-recover') {
      orbScale = 0.6
      armLift = -1.7 + 0.8 * Math.min(1, this.actionTime / CAST_RECOVERY)
    } else if (this.action === 'blink') {
      const k = Math.min(1, this.actionTime / BLINK_WINDUP)
      orbScale = 1 + 1.6 * k
      orbHeat = 1
      armLift = -2.4
    }
    if (this.orb) {
      this.orb.scale.setScalar(orbScale)
      this.orb.rotation.y += deltaTime * 3
      this.orb.position.y = 21.5 * S + Math.sin(this.bobPhase * 1.7) * 0.03
    }
    for (const arm of this.arms) arm.rotation.x = armLift
    if (this.orbMaterial) {
      const c = this.orbMaterial.color
      c.setHex(ORB)
      c.lerp(new THREE.Color(ORB_HOT), orbHeat)
    }
    if (this.eyeMaterial) this.eyeMaterial.color.setHex(this.action === 'blink' ? 0xffffff : EYES)
  }

  dispose(): void {
    this.orb = null
    this.orbMaterial = null
    this.eyeMaterial = null
    this.arms = []
    this.robe = null
    this.targetRef = null
    this.spawnFn = null
    this.solidQuery = null
    this.bolts.length = 0
    super.dispose()
  }
}
