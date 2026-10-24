import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { SpiderSilkItem } from '../../../items/materials/spider_silk/SpiderSilkItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'

// Dark, hairy cave spider: near-black chitin, bristly brown hair, a dull
// chevron pattern on the abdomen and a cluster of glowing red eyes
const BODY = 0x2a2420
const BODY_DARK = 0x1a1614
const HAIR = 0x3e342c
const LEG = 0x241e1a
const MARKING = 0x4a3a2e
const FANG = 0x120e0c
const EYE = 0xff2a1a

const S = 0.0625 // 1 "pixel" = 1/16 block

/** Seconds of poison per landed bite. */
const POISON_SECONDS = 4
const BITE_DAMAGE = 3

// Pounce: rear up (the tell), then leap at the player from mid range
const POUNCE_MIN_RANGE = 3
const POUNCE_MAX_RANGE = 7
const REAR_TIME = 0.4
const POUNCE_SPEED = 9.5
const POUNCE_LIFT = 6
const POUNCE_COOLDOWN = 3.5
const POUNCE_HIT_RANGE = 1.4

// Zig-zag skitter while closing in
const ZIGZAG_SPEED = 3.2 // sideways blocks/s at the peak of a swerve
const ZIGZAG_RATE = 5.5 // rad/s
const ZIGZAG_MIN_RANGE = 2.5

/** Legs: [z offset (px), fan angle] front to back; mirrored per side. */
const LEG_LAYOUT: ReadonlyArray<readonly [number, number]> = [
  [4.5, -0.75],
  [2.5, -0.25],
  [0.5, 0.25],
  [-1.5, 0.75],
]
const BODY_Y = 4.5 * S
const THIGH_LIFT = 0.75

interface SpiderLeg {
  hip: THREE.Group
  thigh: THREE.Group
  side: number
  fan: number
  /** 0 or π: alternating tetrapod gait. */
  phase: number
  front: boolean
}

/**
 * Cave spider - a dark, hairy spider of the webbed hollows (rarely other
 * caves). Notices the player within 14 blocks, skitters in at a fast
 * zig-zag, and from mid range rears up (the tell, 0.4 s) and pounces; every
 * bite (pounce or close range) poisons.
 *
 * Stats: 16 HP, 3 damage + poison (4 s), 14 block detection, 6.2 blocks/s.
 * Drops: 1-2 spider silk.
 */
export class CaveSpiderEntity extends AggressiveEntity {
  readonly type = 'cave_spider'

  private hunterRef: THREE.Vector3 | null = null
  private damageFn: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null

  private pounceCooldown = 1.5
  private rearTimer = 0
  private pouncing = false
  private pounceHit = false
  private pounceAirTime = 0
  private zigzagPhase = Math.random() * Math.PI * 2
  private biteTimer = 0

  private walkPhase = Math.random() * Math.PI * 2
  private eyePhase = Math.random() * Math.PI * 2
  private torso: THREE.Group | null = null
  private legs: SpiderLeg[] = []
  private fangs: THREE.Group[] = []
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('cave_spider', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 0.55, 0.9),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 16,
      attackDamage: BITE_DAMAGE,
      attackRange: 1.5,
      attackCooldown: 1.0,
      detectionRange: 14,
      chaseSpeed: 6.2,
      walkSpeed: 2.2,
      jumpVelocity: 8.5,
      attackKnockbackHorizontal: 3.5,
      attackKnockbackVertical: 2.5,
      drops: [{ createItem: () => new SpiderSilkItem(), minCount: 1, maxCount: 2 }],
    })
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.hunterRef = positionRef
  }

  override setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void): void {
    super.setPlayerDamageCallback(callback)
    this.damageFn = callback
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const torso = new THREE.Group()
    root.add(torso)
    this.torso = torso

    const body = new THREE.MeshLambertMaterial({ color: BODY })
    const bodyDark = new THREE.MeshLambertMaterial({ color: BODY_DARK })
    const hair = new THREE.MeshLambertMaterial({ color: HAIR })
    const leg = new THREE.MeshLambertMaterial({ color: LEG })
    const marking = new THREE.MeshLambertMaterial({ color: MARKING })
    const fang = new THREE.MeshLambertMaterial({ color: FANG })
    for (const m of [body, bodyDark, hair, leg, marking, fang]) this.registerMaterialForLighting(m)
    // Eyes stay lit: a red glint in the dark
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Cephalothorax (front, +z) and the big hairy abdomen behind it
    box(6, 4, 6, body, 0, 5.5, 2.5, torso)
    box(4.5, 1, 4.5, bodyDark, 0, 7.8, 2.2, torso)
    box(2.5, 2, 1.5, bodyDark, 0, 4.5, -0.8, torso) // waist
    box(9, 7, 10, body, 0, 6.5, -6.5, torso)
    box(7.5, 1.2, 8.5, bodyDark, 0, 10.4, -6.5, torso)
    box(7, 1, 8, bodyDark, 0, 3, -6.5, torso) // belly
    // Chevron markings down the abdomen's back
    const chevrons: Array<[number, number]> = [[-3, 3.5], [-5.5, 2.6], [-8, 1.8]]
    for (const [z, w] of chevrons) {
      box(w, 0.4, 1, marking, -w / 2, 11.1, z, torso)
      box(w, 0.4, 1, marking, w / 2, 11.1, z, torso)
    }
    // Bristles: tufts over the abdomen and thorax
    const tufts: Array<[number, number, number]> = [
      [-4.6, 8, -3], [4.6, 8.5, -4.5], [-4.6, 7, -8], [4.6, 6.5, -9.5], [-2.5, 10.5, -10.8],
      [2.8, 10.2, -1.8], [-3.2, 6.8, 1], [3.2, 7, 3.6], [0, 9.8, -11.6], [-4.2, 4, -6],
    ]
    for (const [x, y, z] of tufts) box(1, 1.6, 1, hair, x, y, z, torso)

    // Eyes: two big glowing eyes at the front, two smaller beside, four tiny on top
    const eyes: Array<[number, number, number, number]> = [
      [-1, 6.4, 5.55, 1.2], [1, 6.4, 5.55, 1.2],
      [-2.4, 6.9, 5.4, 0.8], [2.4, 6.9, 5.4, 0.8],
      [-1.2, 7.7, 4.6, 0.6], [1.2, 7.7, 4.6, 0.6], [-2.4, 7.6, 4, 0.5], [2.4, 7.6, 4, 0.5],
    ]
    for (const [x, y, z, size] of eyes) box(size, size, 0.4, this.eyeMaterial, x, y, z, torso)

    // Fangs: two chelicerae under the eyes, hinged at the top
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(side * 1.1 * S, 4.6 * S, 5.4 * S)
      box(1.3, 2.4, 1.3, fang, 0, -1.2, 0.3, pivot)
      box(0.7, 1.2, 0.7, bodyDark, side * -0.2, -2.8, 0.8, pivot)
      torso.add(pivot)
      this.fangs.push(pivot)
    }

    // Legs: thigh rising from the hip, shin dropping to the ground
    for (const [lz, fanAngle] of LEG_LAYOUT) {
      for (const side of [-1, 1]) {
        const hip = new THREE.Group()
        hip.position.set(side * 2.5 * S, BODY_Y, lz * S)
        // Fan the legs: front pairs reach forward (+z), back pairs backward
        hip.rotation.y = side * fanAngle
        const thigh = new THREE.Group()
        thigh.rotation.z = side * THIGH_LIFT
        box(7, 1.3, 1.3, leg, side * 3.5, 0, 0, thigh)
        box(1, 1.4, 1, hair, side * 4, 0.9, 0, thigh)
        const knee = new THREE.Group()
        knee.position.set(side * 7 * S, 0, 0)
        knee.rotation.z = -side * THIGH_LIFT
        const shin = new THREE.Group()
        shin.rotation.z = side * 0.25
        box(1.1, 9, 1.1, leg, 0, -4.5, 0, shin)
        box(1.2, 1.2, 1.2, hair, side * 0.3, -1.5, 0, shin)
        knee.add(shin)
        thigh.add(knee)
        hip.add(thigh)
        torso.add(hip)
        const index = this.legs.length
        this.legs.push({
          hip,
          thigh,
          side,
          fan: hip.rotation.y,
          phase: (index >> 1) % 2 === (side > 0 ? 0 : 1) ? 0 : Math.PI,
          front: lz > 2,
        })
      }
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [torso, ...this.fangs, ...this.legs.flatMap((l) => [l.hip, l.thigh])],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  /** Close-range bite: damage, and poison if it landed. */
  protected override performAttack(): void {
    this.bite()
  }

  private bite(): void {
    const player = this.hunterRef
    if (!player || !this.damageFn) return
    this.tmp.copy(player).sub(this.position)
    this.tmp.y = 0
    if (this.tmp.lengthSq() > 1e-4) this.tmp.normalize()
    this.tmp.multiplyScalar(this.attackKnockbackHorizontal)
    this.tmp.y = this.attackKnockbackVertical
    if (this.damageFn(BITE_DAMAGE, this.tmp.clone(), 'melee') !== false) {
      playerEffects.apply(StatusEffectIds.POISON, POISON_SECONDS, 1)
    }
    this.biteTimer = 0.3
  }

  override update(deltaTime: number): void {
    this.biteTimer = Math.max(0, this.biteTimer - deltaTime)
    if (this._isDying || this.knockbackTimer > 0) {
      this.rearTimer = 0
      this.pouncing = false
      super.update(deltaTime)
      return
    }
    this.pounceCooldown = Math.max(0, this.pounceCooldown - deltaTime)
    const body = this.getPhysicsBody()
    const player = this.hunterRef

    // Mid-air pounce: keep the leap's momentum, bite once on contact
    if (this.pouncing && body) {
      this.pounceAirTime += deltaTime
      if (player && !this.pounceHit && this.position.distanceTo(player) <= POUNCE_HIT_RANGE + 0.4) {
        this.pounceHit = true
        this.bite()
        this.attackCooldown = this.attackCooldownDuration
      }
      if ((body.isOnGround && this.pounceAirTime > 0.15) || this.pounceAirTime > 1.4) {
        this.pouncing = false
        this.pounceCooldown = POUNCE_COOLDOWN
      }
      this.syncMesh(body.position)
      this.updateAnimations(deltaTime)
      return
    }

    // Reared up (the tell) - then leap
    if (this.rearTimer > 0 && body && player) {
      this.rearTimer -= deltaTime
      body.velocity.x = 0
      body.velocity.z = 0
      this.faceToward(player)
      if (this.rearTimer <= 0) {
        this.tmp.copy(player).sub(this.position)
        this.tmp.y = 0
        if (this.tmp.lengthSq() > 0.001) this.tmp.normalize()
        body.velocity.x = this.tmp.x * POUNCE_SPEED
        body.velocity.z = this.tmp.z * POUNCE_SPEED
        body.velocity.y = POUNCE_LIFT
        this.pouncing = true
        this.pounceHit = false
        this.pounceAirTime = 0
      }
      this.syncMesh(body.position)
      this.updateAnimations(deltaTime)
      return
    }

    if (this.isAggressive && player && body?.isOnGround && this.pounceCooldown <= 0) {
      const dx = player.x - this.position.x
      const dz = player.z - this.position.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d >= POUNCE_MIN_RANGE && d <= POUNCE_MAX_RANGE && Math.abs(player.y - this.position.y) < 2.5) {
        this.rearTimer = REAR_TIME
        return
      }
    }

    super.update(deltaTime)

    // Skitter: swerve side to side while closing in (applied on top of the chase)
    if (this.isAggressive && this.isWalking && body && player) {
      const dx = player.x - this.position.x
      const dz = player.z - this.position.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d > ZIGZAG_MIN_RANGE) {
        this.zigzagPhase += deltaTime * ZIGZAG_RATE
        const swerve = Math.sin(this.zigzagPhase) * ZIGZAG_SPEED
        body.velocity.x += (-dz / d) * swerve
        body.velocity.z += (dx / d) * swerve
      }
    }
  }

  private syncMesh(at: THREE.Vector3): void {
    this.position.copy(at)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
  }

  private faceToward(target: THREE.Vector3): void {
    const mesh = this.getMesh()
    if (!mesh) return
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz > 0.01) mesh.rotation.y = Math.atan2(dx, dz)
  }

  protected updateAnimations(deltaTime: number): void {
    // Eyes: a dull glow, burning brighter while hunting
    this.eyePhase += deltaTime * (this.isAggressive ? 7 : 2)
    if (this.eyeMaterial) {
      const k = (this.isAggressive ? 0.85 : 0.55) + 0.15 * Math.sin(this.eyePhase)
      this.eyeMaterial.color.setHex(EYE).multiplyScalar(k)
    }

    const rearing = this.rearTimer > 0
    const moving = this.isWalking || this.pouncing
    if (moving) this.walkPhase += deltaTime * (this.isAggressive ? 22 : 11)

    for (const leg of this.legs) {
      const s = leg.side
      if (this.pouncing) {
        // Legs flung forward to grab
        leg.hip.rotation.y = leg.fan + (leg.front ? -s * 0.5 : s * 0.3)
        leg.thigh.rotation.z = s * (THIGH_LIFT + (leg.front ? 0.6 : -0.2))
      } else if (rearing && leg.front) {
        // Front legs raised high, waving
        leg.hip.rotation.y = leg.fan - s * 0.3
        leg.thigh.rotation.z = s * (1.5 + 0.15 * Math.sin(this.eyePhase * 3))
      } else if (moving) {
        const t = this.walkPhase + leg.phase
        leg.hip.rotation.y = leg.fan + Math.sin(t) * 0.35
        leg.thigh.rotation.z = s * (THIGH_LIFT + Math.max(0, Math.cos(t)) * 0.35)
      } else {
        leg.hip.rotation.y += (leg.fan - leg.hip.rotation.y) * Math.min(1, deltaTime * 8)
        leg.thigh.rotation.z += (s * THIGH_LIFT - leg.thigh.rotation.z) * Math.min(1, deltaTime * 8)
      }
    }

    if (this.torso) {
      // Rear: the front of the body tips up; pounce: nose down into the leap
      const pitch = rearing ? -0.45 : this.pouncing ? 0.15 : 0
      this.torso.rotation.x += (pitch - this.torso.rotation.x) * Math.min(1, deltaTime * 12)
      this.torso.position.y = moving && !this.pouncing ? Math.abs(Math.sin(this.walkPhase)) * 0.02 : 0
    }

    // Fangs spread on a bite and while reared
    const open = this.biteTimer > 0 || this.pouncing ? 0.7 : rearing ? 0.45 : 0.05
    for (let i = 0; i < this.fangs.length; i++) {
      const f = this.fangs[i]
      const target = (i === 0 ? -1 : 1) * open
      f.rotation.z += (target - f.rotation.z) * Math.min(1, deltaTime * 14)
      f.rotation.x += ((this.biteTimer > 0 ? -0.5 : 0) - f.rotation.x) * Math.min(1, deltaTime * 14)
    }
  }

  override dispose(): void {
    this.hunterRef = null
    this.damageFn = null
    this.torso = null
    this.legs = []
    this.fangs = []
    this.eyeMaterial = null
    super.dispose()
  }
}
