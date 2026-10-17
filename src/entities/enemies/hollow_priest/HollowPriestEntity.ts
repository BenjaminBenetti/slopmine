import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import { EntityState } from '../../interfaces/IEntity.ts'
import type { IItem } from '../../../items/Item.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { EctoplasmItem } from '../../../items/materials/ectoplasm/EctoplasmItem.ts'
import { SoulShardItem } from '../../../items/materials/soul_shard/SoulShardItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

// Stats (dungeon-only caster, tuned for diamond/infernium players)
const MAX_HEALTH = 32

// Soul bolt: a homing orb from the censer
const BOLT_DAMAGE = 7
const BOLT_SPEED = 10
const BOLT_HOMING = 0.9
const BOLT_SLOW_SECONDS = 3
const CAST_WINDUP = 1.0
const CAST_COOLDOWN = 2.8
const CAST_RANGE = 16

// Bone ward: a ring of spikes bursting from the floor, then a blink away
const WARD_TRIGGER = 4
const WARD_WINDUP = 0.8
const WARD_RADIUS = 3.4
const WARD_DAMAGE = 6
const WARD_KNOCKBACK = 7
const WARD_COOLDOWN = 6
const SPIKE_SHOW = 0.45

// Spacing it keeps from the player
const KEEP_NEAR = 6
const KEEP_FAR = 11
const LOSE_RANGE = 32

const ROBE = 0x2e2838
const ROBE_TRIM = 0x5b4970
const BONE = 0xd8cfba
const BRONZE = 0x8a6a3a
const HOOD_VOID = 0x0b0d0a
const SOUL = 0x7dffa6

enum PriestAction {
  MOVE,
  CAST,
  WARD,
}

/**
 * Hollow Priest - a tall robed caster of the Catacombs (dungeon garrisons
 * only): an empty hood with two soul-lit eyes, an open ribcage glowing green,
 * a censer swinging on a chain. It keeps 6-11 blocks from the player and
 * casts a homing soul bolt (censer raised, orb swelling for 1 s; 7 damage +
 * slowness). Pressed closer than 4 blocks it calls a bone ward - a ring of
 * spikes bursts from the floor around it after a 0.8 s ground-glow
 * telegraph (6 damage + knockback) - and blinks 6-8 blocks away.
 *
 * Stats: 32 HP. Drops: 1-2 ectoplasm, 0-2 bones, 25% a soul shard.
 */
export class HollowPriestEntity extends AggressiveEntity {
  readonly type = 'hollow_priest'

  private action = PriestAction.MOVE
  private actionTimer = 0
  private castCooldown = 1.5
  private wardCooldown = 0
  private spikeTimer = 0
  private loseTimer = 0
  private strafeSign = Math.random() < 0.5 ? -1 : 1
  private strafeTimer = 0
  private bobPhase = Math.random() * Math.PI * 2

  private hunterRef: THREE.Vector3 | null = null
  private damageFn: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null
  private entitySpawnFn: ((entity: IEntity) => boolean) | null = null
  private readonly bolts: IEntity[] = []

  // Mesh parts
  private upper: THREE.Group | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private censer: THREE.Group | null = null
  private castOrb: THREE.Mesh | null = null
  private wardRing: THREE.Group | null = null
  private spikes: THREE.Group | null = null
  private glowMaterial: THREE.MeshBasicMaterial | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('hollow_priest', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 2.25, 0.7),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: WARD_DAMAGE,
      attackRange: 3,
      attackCooldown: 2,
      detectionRange: 20,
      chaseSpeed: 3.0,
      walkSpeed: 1.6,
      knockbackHorizontal: 4,
      drops: [
        { createItem: () => new EctoplasmItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new BoneItem(), minCount: 0, maxCount: 2 },
      ],
    })
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.hunterRef = positionRef
  }

  override setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageFn = callback
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQuery = solidQuery
  }

  /** Wired by EntityManager (duck-typed): lets the priest cast soul bolts. */
  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.entitySpawnFn = spawn
  }

  /** Soul bolts still in flight (cleared with the priest by garrison/guardian owners). */
  get spawnedChildren(): readonly IEntity[] {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.isAlive || b.state === EntityState.DISPOSED) this.bolts.splice(i, 1)
    }
    return this.bolts
  }

  override getDrops(): IItem[] {
    const drops = super.getDrops()
    if (drops.length > 0 && Math.random() < 0.25) drops.push(new SoulShardItem())
    return drops
  }

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const hit = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (hit && this.action === PriestAction.CAST) {
      // A blow interrupts the cast (the ward cannot be interrupted)
      this.action = PriestAction.MOVE
      this.castCooldown = 1.2
    }
    return hit
  }

  override update(deltaTime: number): void {
    this.bobPhase += deltaTime * 2
    this.spikeTimer = Math.max(0, this.spikeTimer - deltaTime)
    this.castCooldown = Math.max(0, this.castCooldown - deltaTime)
    this.wardCooldown = Math.max(0, this.wardCooldown - deltaTime)

    if (this._isDying || this.knockbackTimer > 0 || !this.isAggressive || !this.hunterRef) {
      if (this.action !== PriestAction.WARD) this.action = PriestAction.MOVE
      super.update(deltaTime)
      return
    }

    const player = this.hunterRef
    const body = this.getPhysicsBody()
    const dx = player.x - this.position.x
    const dz = player.z - this.position.z
    const d = Math.hypot(dx, dz)

    // Lose interest far away
    this.loseTimer = d > LOSE_RANGE ? this.loseTimer + deltaTime : 0
    if (this.loseTimer > 5) {
      this.isAggressive = false
      this.action = PriestAction.MOVE
      super.update(deltaTime)
      return
    }

    this.face(player)
    switch (this.action) {
      case PriestAction.MOVE: {
        if (d < WARD_TRIGGER && this.wardCooldown <= 0) {
          this.action = PriestAction.WARD
          this.actionTimer = WARD_WINDUP
          this.stop(body)
          break
        }
        if (this.castCooldown <= 0 && d <= CAST_RANGE && this.hasLineOfSight(player)) {
          this.action = PriestAction.CAST
          this.actionTimer = CAST_WINDUP
          this.stop(body)
          break
        }
        this.keepDistance(body, dx, dz, d, deltaTime)
        break
      }
      case PriestAction.CAST: {
        this.stop(body)
        this.actionTimer -= deltaTime
        if (this.actionTimer <= 0) {
          this.fireBolt(player)
          this.castCooldown = CAST_COOLDOWN
          this.action = PriestAction.MOVE
        }
        break
      }
      case PriestAction.WARD: {
        this.stop(body)
        this.actionTimer -= deltaTime
        if (this.actionTimer <= 0) {
          this.boneWard(player, dx, dz, d)
          this.wardCooldown = WARD_COOLDOWN
          this.action = PriestAction.MOVE
          this.blinkAway(player)
        }
        break
      }
    }

    if (body) this.position.copy(body.position)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    this.updateAnimations(deltaTime)
  }

  private stop(body: ReturnType<HollowPriestEntity['getPhysicsBody']>): void {
    if (body) { body.velocity.x = 0; body.velocity.z = 0 }
    this.isWalking = false
  }

  /** Hold 6-11 blocks from the player, drifting sideways in between. */
  private keepDistance(body: ReturnType<HollowPriestEntity['getPhysicsBody']>, dx: number, dz: number, d: number, deltaTime: number): void {
    if (!body) return
    const nx = d > 1e-3 ? dx / d : 0
    const nz = d > 1e-3 ? dz / d : 0
    let vx = 0
    let vz = 0
    if (d > KEEP_FAR) {
      vx = nx * this.chaseSpeed
      vz = nz * this.chaseSpeed
    } else if (d < KEEP_NEAR) {
      vx = -nx * this.walkSpeed * 1.4
      vz = -nz * this.walkSpeed * 1.4
    } else {
      this.strafeTimer -= deltaTime
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 2 + Math.random() * 2
        this.strafeSign = -this.strafeSign
      }
      vx = -nz * this.strafeSign * 0.9
      vz = nx * this.strafeSign * 0.9
    }
    body.velocity.x = vx
    body.velocity.z = vz
    this.isWalking = Math.abs(vx) + Math.abs(vz) > 0.1
  }

  private fireBolt(player: THREE.Vector3): void {
    if (!this.entitySpawnFn) return
    // From the raised censer, toward the player's chest
    const from = new THREE.Vector3(this.position.x, this.position.y + 1.9, this.position.z)
    const velocity = new THREE.Vector3(player.x, player.y + 1.1, player.z).sub(from)
    if (velocity.lengthSq() < 1e-4) return
    velocity.normalize().multiplyScalar(BOLT_SPEED)
    const bolt = new ProjectileEntity({
      position: from,
      velocity,
      damage: BOLT_DAMAGE,
      owner: this,
      mesh: createSoulBoltMesh(),
      radius: 0.32,
      homing: BOLT_HOMING,
      lifetime: 4,
      knockback: 2,
      effect: { id: StatusEffectIds.SLOWNESS, seconds: BOLT_SLOW_SECONDS, level: 1 },
    })
    if (this.entitySpawnFn(bolt)) this.bolts.push(bolt)
  }

  private boneWard(player: THREE.Vector3, dx: number, dz: number, d: number): void {
    this.spikeTimer = SPIKE_SHOW
    if (!this.damageFn) return
    if (d > WARD_RADIUS || Math.abs(player.y - this.position.y) > 2.5) return
    this.tmp.set(dx, 0, dz)
    if (this.tmp.lengthSq() > 1e-4) this.tmp.normalize()
    this.tmp.multiplyScalar(WARD_KNOCKBACK)
    this.tmp.y = 4
    this.damageFn(WARD_DAMAGE, this.tmp.clone(), 'magic')
  }

  /** Blink to a standable cell 6-8 blocks from the player (stays put if none). */
  private blinkAway(player: THREE.Vector3): void {
    const body = this.getPhysicsBody()
    if (!body || !this.solidQuery) return
    const solid = this.solidQuery
    const baseY = Math.floor(this.position.y)
    const start = Math.random() * Math.PI * 2
    for (let i = 0; i < 12; i++) {
      const angle = start + (i / 12) * Math.PI * 2
      const r = 6 + (i % 3)
      const x = Math.floor(player.x + Math.sin(angle) * r)
      const z = Math.floor(player.z + Math.cos(angle) * r)
      for (const y of [baseY, baseY + 1, baseY - 1]) {
        if (solid(x, y - 1, z) && !solid(x, y, z) && !solid(x, y + 1, z) && !solid(x, y + 2, z) && this.clearPath(x + 0.5, y + 1.5, z + 0.5, player)) {
          body.position.set(x + 0.5, y, z + 0.5)
          body.velocity.set(0, 0, 0)
          this.position.copy(body.position)
          return
        }
      }
    }
  }

  private clearPath(x: number, y: number, z: number, player: THREE.Vector3): boolean {
    if (!this.solidQuery) return true
    const tx = player.x, ty = player.y + 1.5, tz = player.z
    const steps = Math.ceil(Math.hypot(tx - x, ty - y, tz - z) / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidQuery(Math.floor(x + (tx - x) * t), Math.floor(y + (ty - y) * t), Math.floor(z + (tz - z) * t))) return false
    }
    return true
  }

  private hasLineOfSight(player: THREE.Vector3): boolean {
    return this.clearPath(this.position.x, this.position.y + 1.9, this.position.z, player)
  }

  private face(target: THREE.Vector3): void {
    const mesh = this.getMesh()
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (mesh && dx * dx + dz * dz > 1e-4) mesh.rotation.y = Math.atan2(dx, dz)
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const robe = new THREE.MeshLambertMaterial({ color: ROBE })
    const trim = new THREE.MeshLambertMaterial({ color: ROBE_TRIM })
    const bone = new THREE.MeshLambertMaterial({ color: BONE })
    const bronze = new THREE.MeshLambertMaterial({ color: BRONZE })
    const hoodVoid = new THREE.MeshBasicMaterial({ color: HOOD_VOID })
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: SOUL })
    const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.9 })
    for (const m of [robe, trim, bone, bronze]) this.registerMaterialForLighting(m)

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      mesh.position.set(x, y, z)
      mesh.castShadow = mat !== hoodVoid
      parent.add(mesh)
      return mesh
    }

    // Long robe, widening to the floor (no legs visible)
    box(0.74, 0.5, 0.62, robe, 0, 0.25, 0, root)
    box(0.66, 0.5, 0.54, robe, 0, 0.72, 0, root)
    box(0.7, 0.08, 0.58, trim, 0, 0.5, 0, root)
    for (const [x, z] of [[-0.3, 0.28], [0.1, 0.3], [0.3, -0.25], [-0.2, -0.3]] as const) box(0.14, 0.18, 0.05, robe, x, 0.02, z, root) // ragged hem

    const upper = new THREE.Group()
    upper.position.set(0, 1.0, 0)
    root.add(upper)
    this.upper = upper
    box(0.6, 0.62, 0.46, robe, 0, 0.31, 0, upper) // chest robe
    // Open chest: ribs around a soul core
    box(0.3, 0.42, 0.04, hoodVoid, 0, 0.36, 0.215, upper)
    for (let i = 0; i < 3; i++) box(0.28, 0.035, 0.03, bone, 0, 0.22 + i * 0.12, 0.24, upper)
    box(0.12, 0.12, 0.08, this.glowMaterial, 0, 0.34, 0.2, upper)
    box(0.72, 0.1, 0.5, trim, 0, 0.62, 0, upper) // mantle
    // Deep hood with an empty face and two soul eyes
    box(0.46, 0.5, 0.48, robe, 0, 0.92, -0.02, upper)
    box(0.5, 0.12, 0.52, trim, 0, 1.16, -0.02, upper)
    box(0.28, 0.3, 0.04, hoodVoid, 0, 0.88, 0.21, upper)
    for (const side of [-1, 1]) box(0.05, 0.04, 0.02, this.glowMaterial, side * 0.07, 0.94, 0.225, upper)
    box(0.16, 0.2, 0.16, robe, 0, 1.28, -0.12, upper) // hood point

    // Sleeves with bone hands
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 0.38, 0.56, 0)
      upper.add(arm)
      box(0.18, 0.56, 0.18, robe, 0, -0.26, 0, arm)
      box(0.2, 0.1, 0.2, trim, 0, -0.52, 0, arm)
      box(0.1, 0.14, 0.08, bone, 0, -0.64, 0.02, arm)
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)
    // Censer on a chain from the right hand, a soul orb inside
    const censer = new THREE.Group()
    censer.position.set(0, -0.68, 0.04)
    this.rightArm.add(censer)
    this.censer = censer
    box(0.025, 0.36, 0.025, bronze, 0, -0.18, 0, censer) // chain
    box(0.18, 0.18, 0.18, bronze, 0, -0.44, 0, censer)
    box(0.2, 0.04, 0.2, bronze, 0, -0.33, 0, censer) // lid rim
    box(0.1, 0.1, 0.19, this.glowMaterial, 0, -0.44, 0, censer)
    const castOrb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), orbMaterial)
    castOrb.position.set(0, -0.44, 0)
    castOrb.scale.setScalar(0.001)
    censer.add(castOrb)
    this.castOrb = castOrb

    // Bone ward: a ground ring (telegraph) and the spikes (strike), hidden
    const ring = new THREE.Group()
    ring.visible = false
    root.add(ring)
    this.wardRing = ring
    const spikes = new THREE.Group()
    spikes.visible = false
    root.add(spikes)
    this.spikes = spikes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const seg = box(0.5, 0.04, 0.16, orbMaterial, Math.sin(a) * WARD_RADIUS, 0.03, Math.cos(a) * WARD_RADIUS, ring)
      seg.rotation.y = a + Math.PI / 2
      const r = 1.2 + (i % 3) * 0.7
      const spike = box(0.16, 0.9 + (i % 2) * 0.4, 0.16, bone, Math.sin(a) * r, 0.45, Math.cos(a) * r, spikes)
      spike.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [upper, this.leftArm, this.rightArm, censer, castOrb, ring, spikes],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  protected updateAnimations(deltaTime: number): void {
    const ease = (k: number, target: number, value: number) => value + (target - value) * Math.min(1, deltaTime * k)
    const casting = this.action === PriestAction.CAST
    const warding = this.action === PriestAction.WARD
    const castP = casting ? 1 - this.actionTimer / CAST_WINDUP : 0
    const wardP = warding ? 1 - this.actionTimer / WARD_WINDUP : 0

    // Censer raised high while casting; arms spread wide while warding
    const rightX = casting ? -2.4 : warding ? -0.6 : -0.25 + 0.1 * Math.sin(this.bobPhase)
    const leftX = casting ? -0.9 : warding ? -0.6 : -0.15
    const spread = warding ? 1.0 : 0
    if (this.rightArm) {
      this.rightArm.rotation.x = ease(8, rightX, this.rightArm.rotation.x)
      this.rightArm.rotation.z = ease(8, spread, this.rightArm.rotation.z)
    }
    if (this.leftArm) {
      this.leftArm.rotation.x = ease(8, leftX, this.leftArm.rotation.x)
      this.leftArm.rotation.z = ease(8, -spread, this.leftArm.rotation.z)
    }
    if (this.censer) this.censer.rotation.x = casting ? 0 : 0.25 * Math.sin(this.bobPhase * 1.6) // swinging
    if (this.upper) this.upper.rotation.x = ease(6, warding ? -0.2 : casting ? -0.1 : 0.06 * Math.sin(this.bobPhase * 0.5), this.upper.rotation.x)
    if (this.castOrb) this.castOrb.scale.setScalar(casting ? 0.3 + 1.6 * castP : 0.001)
    if (this.wardRing) {
      this.wardRing.visible = warding
      this.wardRing.scale.setScalar(0.4 + 0.6 * wardP)
    }
    if (this.spikes) this.spikes.visible = this.spikeTimer > 0
    if (this.glowMaterial) {
      const g = casting || warding ? 0.7 + 0.3 * Math.max(castP, wardP) : 0.55 + 0.15 * Math.sin(this.bobPhase * 2)
      this.glowMaterial.color.setRGB(0.49 * g + 0.3 * (g - 0.55), 1.0 * g, 0.65 * g)
    }
  }

  override dispose(): void {
    this.hunterRef = null
    this.damageFn = null
    this.solidQuery = null
    this.entitySpawnFn = null
    this.bolts.length = 0
    this.upper = null
    this.leftArm = null
    this.rightArm = null
    this.censer = null
    this.castOrb = null
    this.wardRing = null
    this.spikes = null
    this.glowMaterial = null
    super.dispose()
  }
}

/** A soul bolt: a pale core inside a glowing green shell (owned by its projectile). */
function createSoulBoltMesh(): THREE.Object3D {
  const group = new THREE.Group()
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x5fe08a, transparent: true, opacity: 0.75 })
  )
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: 0xe6fff0 }))
  group.add(shell)
  group.add(core)
  return group
}
