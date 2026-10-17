import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { SulfurItem } from '../../../items/ores/sulfur/SulfurItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Colours: charred hide split by glowing ember cracks, a burning mane
const HIDE = 0x2a201d
const HIDE_DARK = 0x16100f
const EMBER = 0xff5a1a
const FLAME = 0xffb43c
const EYE = 0xffe066

// Dimensions (1 pixel = 1/16 block): a lean hound, a little bigger than a wolf
const SCALE = 0.0625
const BODY_W = 8 * SCALE
const BODY_H = 7 * SCALE
const BODY_D = 15 * SCALE
const HEAD = 6 * SCALE
const SNOUT_W = 3.5 * SCALE
const SNOUT_H = 2.5 * SCALE
const SNOUT_D = 4 * SCALE
const LEG_W = 2 * SCALE
const LEG_H = 7 * SCALE
const TAIL_D = 8 * SCALE

/** Pounce: leap at the player from mid range. */
const POUNCE_MIN_RANGE = 3.5
const POUNCE_MAX_RANGE = 7.5
const POUNCE_COOLDOWN = 4.0
const POUNCE_SPEED = 10.0
const POUNCE_LIFT = 6.5
const POUNCE_DAMAGE = 7
const POUNCE_HIT_RANGE = 1.9

/** Flanking: pack members circle in at an angle until they are close. */
const FLANK_RANGE = 5

/** Most hellhounds near the player (the spawn cap; pack followers count too). */
export const HELLHOUND_MAX_NEARBY = 6

/** Pack size brought by a pack leader (besides itself). */
const PACK_FOLLOWERS_MIN = 1
const PACK_FOLLOWERS_MAX = 2

/**
 * Adds a leader's pack followers to the world (wired from setupMolten
 * through the EntityManager, which trims the pack to the spawn cap).
 * Spawning goes through it so followers are tracked, updated and capped
 * like any spawned entity.
 */
let packSpawner: ((followers: HellhoundEntity[]) => void) | null = null

export interface IHellhoundConfig extends Partial<IAggressiveEntityConfig> {
  position: THREE.Vector3
  /** A pack leader brings 1-2 followers when it enters the world. */
  packLeader?: boolean
}

/**
 * Hellhound - a pack hunter of the Molten Wastes' badlands: a charred,
 * ember-cracked hound with a burning mane. Packs of 2-3 run the player down,
 * fan out to flank, and pounce from mid range.
 *
 * Stats: 24 HP, bite 5 (pounce 7), 6.2 blocks/s chase, 22 block detection.
 * Drops: 0-2 bone, 1-2 sulfur (brimstone from its burning hide).
 */
export class HellhoundEntity extends AggressiveEntity {
  readonly type = 'hellhound'

  /** Wire the pack spawner (main thread, once). */
  static setPackSpawner(spawner: ((followers: HellhoundEntity[]) => void) | null): void {
    packSpawner = spawner
  }

  private packPending: boolean
  private readonly flankAngle: number

  // Pounce state
  private pounceCooldown = 1.5
  private pouncing = false
  private pounceHit = false
  private readonly pounceVelocity = new THREE.Vector3()

  // Player references (the base keeps its own privately)
  private targetRef: THREE.Vector3 | null = null
  private damageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null
  private readonly knockback = new THREE.Vector3()

  // Animation
  private legPhase = Math.random() * Math.PI * 2
  private flamePhase = Math.random() * Math.PI * 2
  private biteTimer = 0
  private legs: THREE.Object3D[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null
  private mane: THREE.Object3D | null = null

  constructor(config: IHellhoundConfig) {
    super('hellhound', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.75, 0.95, 1.15),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 24,
      attackDamage: 5,
      attackRange: 1.9,
      attackCooldown: 1.1,
      detectionRange: 22,
      chaseSpeed: 6.2,
      walkSpeed: 2.8,
      jumpVelocity: 8.5,
      attackKnockbackHorizontal: 5.0,
      attackKnockbackVertical: 3.0,
      drops: [
        { createItem: () => new BoneItem(), minCount: 0, maxCount: 2 },
        { createItem: () => new SulfurItem(), minCount: 1, maxCount: 2 },
      ],
    })
    this.packPending = config.packLeader === true
    this.flankAngle = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45)
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.targetRef = positionRef
  }

  override setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageCallback = callback
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    const hide = new THREE.MeshLambertMaterial({ color: HIDE })
    const hideDark = new THREE.MeshLambertMaterial({ color: HIDE_DARK })
    this.registerMaterialForLighting(hide)
    this.registerMaterialForLighting(hideDark)
    // Glowing parts are not light-dimmed: they light themselves
    const ember = new THREE.MeshBasicMaterial({ color: EMBER })
    const flame = new THREE.MeshBasicMaterial({ color: FLAME })
    const eye = new THREE.MeshBasicMaterial({ color: EYE })

    const bodyY = LEG_H + BODY_H / 2
    const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D), hide)
    body.position.y = bodyY
    body.castShadow = true
    group.add(body)

    // Ember cracks along the flanks and spine
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.01, BODY_H * 0.18, BODY_D * 0.22), ember)
        crack.position.set(side * (BODY_W / 2 + 0.004), bodyY + (i - 1) * BODY_H * 0.22, (i - 1) * BODY_D * 0.26 + side * 0.03)
        crack.rotation.x = 0.35 * (i - 1)
        group.add(crack)
      }
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(BODY_W * 0.18, 0.01, BODY_D * 0.7), ember)
    spine.position.set(0, LEG_H + BODY_H + 0.004, -BODY_D * 0.05)
    group.add(spine)

    // Burning mane over the shoulders (flickers)
    const mane = new THREE.Group()
    const maneOuter = new THREE.Mesh(new THREE.BoxGeometry(BODY_W * 1.05, BODY_H * 0.55, BODY_D * 0.32), ember)
    const maneInner = new THREE.Mesh(new THREE.BoxGeometry(BODY_W * 0.6, BODY_H * 0.75, BODY_D * 0.2), flame)
    maneInner.position.y = BODY_H * 0.15
    mane.add(maneOuter, maneInner)
    mane.position.set(0, LEG_H + BODY_H * 1.05, BODY_D * 0.28)
    group.add(mane)
    this.mane = mane

    // Head
    const head = new THREE.Group()
    const skull = new THREE.Mesh(new THREE.BoxGeometry(HEAD, HEAD, HEAD), hide)
    skull.castShadow = true
    head.add(skull)
    const snout = new THREE.Mesh(new THREE.BoxGeometry(SNOUT_W, SNOUT_H, SNOUT_D), hideDark)
    snout.position.set(0, -HEAD / 5, HEAD / 2 + SNOUT_D / 2)
    head.add(snout)
    const jawGlow = new THREE.Mesh(new THREE.BoxGeometry(SNOUT_W * 0.8, 0.02, SNOUT_D * 0.8), ember)
    jawGlow.position.set(0, -HEAD / 5 - SNOUT_H / 2 + 0.005, HEAD / 2 + SNOUT_D / 2)
    head.add(jawGlow)
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.BoxGeometry(1.2 * SCALE, 3 * SCALE, 1.2 * SCALE), hideDark)
      horn.position.set(side * HEAD / 3, HEAD / 2 + 1.2 * SCALE, -HEAD / 6)
      horn.rotation.x = -0.4
      head.add(horn)
      const eyeMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4 * SCALE, 0.9 * SCALE, 0.2 * SCALE), eye)
      eyeMesh.position.set(side * HEAD / 4, HEAD / 6, HEAD / 2 + 0.01)
      head.add(eyeMesh)
    }
    head.position.set(0, LEG_H + BODY_H * 0.8, BODY_D / 2 + HEAD / 3)
    group.add(head)
    this.head = head

    // Tail with a flame tip
    const tail = new THREE.Group()
    const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(2 * SCALE, 2 * SCALE, TAIL_D), hide)
    tailMesh.position.z = -TAIL_D / 2
    tail.add(tailMesh)
    const tailFlame = new THREE.Mesh(new THREE.BoxGeometry(3 * SCALE, 3 * SCALE, 3 * SCALE), flame)
    tailFlame.position.z = -TAIL_D - 1.5 * SCALE
    tail.add(tailFlame)
    tail.position.set(0, LEG_H + BODY_H * 0.85, -BODY_D / 2)
    tail.rotation.x = -0.3
    group.add(tail)
    this.tail = tail

    // Legs (pivot at the hip)
    this.legs = []
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const pivot = new THREE.Group()
      const leg = new THREE.Mesh(new THREE.BoxGeometry(LEG_W, LEG_H, LEG_W), hideDark)
      leg.position.y = -LEG_H / 2
      leg.castShadow = true
      pivot.add(leg)
      pivot.position.set((x * BODY_W) / 3, LEG_H, (z * BODY_D) / 3)
      group.add(pivot)
      this.legs.push(pivot)
    }

    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, this.head, this.tail, this.mane],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  override update(deltaTime: number): void {
    // A pack leader brings its pack once it is in the world
    if (this.packPending && packSpawner && this.isAlive) {
      this.packPending = false
      const count = PACK_FOLLOWERS_MIN + Math.floor(Math.random() * (PACK_FOLLOWERS_MAX - PACK_FOLLOWERS_MIN + 1))
      const followers: HellhoundEntity[] = []
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        followers.push(new HellhoundEntity({
          position: new THREE.Vector3(
            this.position.x + Math.cos(angle) * 1.5,
            this.position.y + 0.3,
            this.position.z + Math.sin(angle) * 1.5
          ),
        }))
      }
      packSpawner(followers)
    }

    super.update(deltaTime)
    if (this.isDying || !this.isAlive) return

    this.pounceCooldown = Math.max(0, this.pounceCooldown - deltaTime)
    this.biteTimer = Math.max(0, this.biteTimer - deltaTime)
    const body = this.getPhysicsBody()
    if (!body || !this.targetRef || !this.isAggressive || this.knockbackTimer > 0) {
      this.pouncing = false
      return
    }

    const dx = this.targetRef.x - this.position.x
    const dz = this.targetRef.z - this.position.z
    const dist = Math.hypot(dx, dz)

    if (this.pouncing) {
      if (body.isOnGround && body.velocity.y <= 0) {
        this.pouncing = false
      } else {
        // Hold the leap's momentum (the chase AI would steer it every tick)
        body.velocity.x = this.pounceVelocity.x
        body.velocity.z = this.pounceVelocity.z
        if (!this.pounceHit && dist < POUNCE_HIT_RANGE && Math.abs(this.targetRef.y - this.position.y) < 2) {
          this.pounceHit = true
          this.hitPlayer(POUNCE_DAMAGE, dx, dz, dist)
        }
        return
      }
    }

    // Pounce from mid range
    if (body.isOnGround && this.pounceCooldown <= 0 && dist >= POUNCE_MIN_RANGE && dist <= POUNCE_MAX_RANGE &&
        Math.abs(this.targetRef.y - this.position.y) < 2.5) {
      this.pouncing = true
      this.pounceHit = false
      this.pounceCooldown = POUNCE_COOLDOWN + Math.random()
      this.pounceVelocity.set((dx / dist) * POUNCE_SPEED, 0, (dz / dist) * POUNCE_SPEED)
      body.velocity.set(this.pounceVelocity.x, POUNCE_LIFT, this.pounceVelocity.z)
      return
    }

    // Flank: circle in at an angle until close (packs fan out)
    if (dist > FLANK_RANGE && this.isWalking) {
      const cos = Math.cos(this.flankAngle)
      const sin = Math.sin(this.flankAngle)
      const vx = body.velocity.x
      const vz = body.velocity.z
      body.velocity.x = vx * cos - vz * sin
      body.velocity.z = vx * sin + vz * cos
    }
  }

  private hitPlayer(damage: number, dx: number, dz: number, dist: number): void {
    if (!this.damageCallback) return
    const inv = dist > 0.001 ? 1 / dist : 0
    this.knockback.set(dx * inv * this.attackKnockbackHorizontal, this.attackKnockbackVertical, dz * inv * this.attackKnockbackHorizontal)
    this.damageCallback(damage, this.knockback)
    this.biteTimer = 0.3
  }

  protected override performAttack(): void {
    super.performAttack()
    this.biteTimer = 0.3
  }

  protected updateAnimations(deltaTime: number): void {
    // Mane and tail flame flicker
    this.flamePhase += deltaTime * 9
    if (this.mane) {
      const s = 1 + Math.sin(this.flamePhase) * 0.08 + Math.sin(this.flamePhase * 2.3) * 0.05
      this.mane.scale.set(s, 1 + Math.sin(this.flamePhase * 1.7) * 0.15, s)
    }

    // Bite: the head snaps forward
    if (this.head) {
      this.head.rotation.x = this.biteTimer > 0 ? -Math.sin((this.biteTimer / 0.3) * Math.PI) * 0.6 : 0
    }

    if (this.pouncing) {
      // Legs stretched out mid-leap
      if (this.legs.length === 4) {
        this.legs[0].rotation.x = -0.9
        this.legs[1].rotation.x = -0.9
        this.legs[2].rotation.x = 0.9
        this.legs[3].rotation.x = 0.9
      }
    } else if (this.isWalking) {
      this.legPhase += deltaTime * (this.isAggressive ? 15 : 8)
      const swing = Math.sin(this.legPhase) * 0.6
      if (this.legs.length === 4) {
        this.legs[0].rotation.x = swing
        this.legs[1].rotation.x = -swing
        this.legs[2].rotation.x = -swing
        this.legs[3].rotation.x = swing
      }
    } else {
      for (const leg of this.legs) leg.rotation.x *= 0.85
    }

    if (this.tail) {
      const target = this.isAggressive ? 0.25 : -0.35
      this.tail.rotation.x += (target - this.tail.rotation.x) * 0.1
      this.tail.rotation.y = Math.sin(this.flamePhase * 0.3) * 0.2
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    this.tail = null
    this.mane = null
    this.targetRef = null
    this.damageCallback = null
    super.dispose()
  }
}
