import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { SoulShardItem } from '../../../items/materials/soul_shard/SoulShardItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

// Stats (DESIGN §8: Hell mobs 16-45 HP, hits 4-9; dungeon-only, tuned for
// diamond/infernium players)
const MAX_HEALTH = 34
const CLAW_DAMAGE = 7
const CLAW_REACH = 2.6
const POISON_SECONDS = 3

// Ambush
const AMBUSH_RANGE = 5
const SHRIEK_TIME = 0.35
const LEAP_SPEED = 8.5
const LEAP_LIFT = 6.5

// Claw combo: wind-up (arms drawn back) -> claw -> claw (+poison) -> recover
const COMBO_WINDUP = 0.45
const COMBO_GAP = 0.3
const COMBO_RECOVER = 0.35

const SKIN = 0x7b856c
const SKIN_DARK = 0x4a5242
const BONE = 0xcfc6b0
const CLOTH = 0x2b2a26
const EYES = 0xd4ffe0

/**
 * Crypt Ghoul - a gaunt, hunched corpse-eater of the Catacombs (dungeon
 * garrisons only). It waits crouched and still in its burial niche; when the
 * player passes within 5 blocks it shrieks and leaps out, then harries with a
 * telegraphed double claw (arms drawn back for 0.45 s); the second claw
 * poisons.
 *
 * Stats: 34 HP, 7 damage per claw (+3 s poison on the second), 6.5 blocks/s.
 * Drops: 1-3 bones, 20% a soul shard.
 */
export class CryptGhoulEntity extends AggressiveEntity {
  readonly type = 'crypt_ghoul'

  private lurking: boolean
  private shriekTimer = 0
  private comboStage = 0 // 0 none, 1 wind-up, 2 between claws, 3 recovery
  private comboTimer = 0

  private hunterRef: THREE.Vector3 | null = null
  private damageFn: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null

  private walkPhase = Math.random() * Math.PI * 2
  private torso: THREE.Group | null = null
  private head: THREE.Group | null = null
  private jaw: THREE.Mesh | null = null
  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private eyeMaterial: THREE.MeshBasicMaterial | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3; lurking?: boolean }) {
    super('crypt_ghoul', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 1.55, 0.7),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: CLAW_DAMAGE,
      attackRange: 2.0,
      attackCooldown: 1.4,
      detectionRange: 18,
      chaseSpeed: 6.5,
      walkSpeed: 2.2,
      jumpVelocity: 8.5,
      attackKnockbackHorizontal: 3.5,
      attackKnockbackVertical: 2.5,
      drops: [{ createItem: () => new BoneItem(), minCount: 1, maxCount: 3 }],
    })
    this.lurking = config.lurking ?? true
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.hunterRef = positionRef
  }

  override setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageFn = callback
  }

  /** Still crouched in its niche, waiting. */
  get isLurking(): boolean {
    return this.lurking
  }

  override getDrops(): IItem[] {
    const drops = super.getDrops()
    if (drops.length > 0 && Math.random() < 0.2) drops.push(new SoulShardItem())
    return drops
  }

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const hit = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (hit) {
      // A blow wakes a lurker and breaks a combo
      this.lurking = false
      this.shriekTimer = 0
      this.comboStage = 0
    }
    return hit
  }

  /** The base chase reached claw range: start the telegraphed combo instead of an instant hit. */
  protected override performAttack(): void {
    this.comboStage = 1
    this.comboTimer = COMBO_WINDUP
  }

  override update(deltaTime: number): void {
    if (this._isDying || this.knockbackTimer > 0) {
      this.comboStage = 0
      super.update(deltaTime)
      return
    }
    const body = this.getPhysicsBody()
    const player = this.hunterRef

    if (this.lurking) {
      if (body) { body.velocity.x = 0; body.velocity.z = 0 }
      if (player) {
        const dx = player.x - this.position.x
        const dz = player.z - this.position.z
        if (dx * dx + dz * dz <= AMBUSH_RANGE * AMBUSH_RANGE && Math.abs(player.y - this.position.y) < 3) {
          this.lurking = false
          this.shriekTimer = SHRIEK_TIME
        }
      }
      this.syncBody()
      this.updateAnimations(deltaTime)
      return
    }

    if (this.shriekTimer > 0) {
      this.shriekTimer -= deltaTime
      if (body) { body.velocity.x = 0; body.velocity.z = 0 }
      if (player) this.face(player)
      if (this.shriekTimer <= 0 && body && player) {
        // Leap out at the player
        this.tmp.set(player.x - this.position.x, 0, player.z - this.position.z)
        if (this.tmp.lengthSq() > 1e-4) this.tmp.normalize()
        body.velocity.x = this.tmp.x * LEAP_SPEED
        body.velocity.z = this.tmp.z * LEAP_SPEED
        body.velocity.y = LEAP_LIFT
        this.isAggressive = true
        this.aggressiveTimer = this.aggroTimeout
      }
      this.syncBody()
      this.updateAnimations(deltaTime)
      return
    }

    if (this.comboStage > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)
      if (body && body.isOnGround) { body.velocity.x = 0; body.velocity.z = 0 }
      if (player) this.face(player)
      this.comboTimer -= deltaTime
      if (this.comboTimer <= 0) {
        if (this.comboStage === 1) {
          this.claw(false)
          this.comboStage = 2
          this.comboTimer = COMBO_GAP
        } else if (this.comboStage === 2) {
          this.claw(true)
          this.comboStage = 3
          this.comboTimer = COMBO_RECOVER
        } else {
          this.comboStage = 0
          this.attackCooldown = this.attackCooldownDuration
        }
      }
      this.syncBody()
      this.updateAnimations(deltaTime)
      return
    }

    super.update(deltaTime)
  }

  private claw(poison: boolean): void {
    const player = this.hunterRef
    if (!player || !this.damageFn) return
    const dx = player.x - this.position.x
    const dz = player.z - this.position.z
    if (dx * dx + dz * dz > CLAW_REACH * CLAW_REACH || Math.abs(player.y - this.position.y) > 2) return
    this.tmp.set(dx, 0, dz)
    if (this.tmp.lengthSq() > 1e-4) this.tmp.normalize()
    this.tmp.multiplyScalar(this.attackKnockbackHorizontal)
    this.tmp.y = this.attackKnockbackVertical
    this.damageFn(CLAW_DAMAGE, this.tmp.clone(), 'melee')
    if (poison) playerEffects.apply(StatusEffectIds.POISON, POISON_SECONDS, 1)
  }

  private face(target: THREE.Vector3): void {
    const mesh = this.getMesh()
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (mesh && dx * dx + dz * dz > 1e-4) mesh.rotation.y = Math.atan2(dx, dz)
  }

  private syncBody(): void {
    const body = this.getPhysicsBody()
    if (body) this.position.copy(body.position)
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const skin = new THREE.MeshLambertMaterial({ color: SKIN })
    const skinDark = new THREE.MeshLambertMaterial({ color: SKIN_DARK })
    const bone = new THREE.MeshLambertMaterial({ color: BONE })
    const cloth = new THREE.MeshLambertMaterial({ color: CLOTH })
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: EYES })
    for (const m of [skin, skinDark, bone, cloth]) this.registerMaterialForLighting(m)

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Bent legs (pivot at the hip, y 0.72)
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 0.16, 0.72, -0.05)
      const thigh = box(0.14, 0.42, 0.14, skin, 0, -0.18, 0.1, leg)
      thigh.rotation.x = -0.5
      box(0.12, 0.42, 0.12, skinDark, 0, -0.5, -0.02, leg) // shin
      box(0.16, 0.06, 0.26, skinDark, 0, -0.7, 0.06, leg) // foot
      root.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    // Torso hunched forward (pivot at the hips)
    const torso = new THREE.Group()
    torso.position.set(0, 0.74, -0.05)
    torso.rotation.x = 0.55
    root.add(torso)
    this.torso = torso
    box(0.36, 0.16, 0.24, cloth, 0, 0, 0, torso) // loincloth
    box(0.12, 0.3, 0.04, cloth, -0.08, -0.18, 0.12, torso)
    box(0.42, 0.62, 0.26, skin, 0, 0.38, 0, torso) // chest
    for (let i = 0; i < 4; i++) box(0.36, 0.035, 0.03, bone, 0, 0.24 + i * 0.1, 0.135, torso) // exposed ribs
    for (let i = 0; i < 4; i++) box(0.06, 0.06, 0.06, bone, 0, 0.18 + i * 0.13, -0.15, torso) // spine knobs

    // Head jutting forward on a long neck
    const head = new THREE.Group()
    head.position.set(0, 0.74, 0.14)
    torso.add(head)
    this.head = head
    box(0.1, 0.14, 0.1, skinDark, 0, -0.04, 0, head) // neck
    box(0.3, 0.26, 0.36, skin, 0, 0.12, 0.12, head)
    box(0.24, 0.06, 0.06, skinDark, 0, 0.2, 0.31, head) // brow
    for (const side of [-1, 1]) box(0.06, 0.04, 0.02, this.eyeMaterial, side * 0.08, 0.15, 0.31, head)
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.3), bone)
    jaw.geometry.translate(0, -0.035, 0.12)
    jaw.position.set(0, 0.01, 0.06)
    head.add(jaw)
    this.jaw = jaw
    for (let i = -1; i <= 1; i++) box(0.03, 0.06, 0.03, bone, i * 0.07, 0.0, 0.29, jaw) // fangs

    // Long arms hanging to the ground (pivot at the shoulder)
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 0.26, 0.62, 0.02)
      torso.add(arm)
      box(0.1, 0.5, 0.1, skin, 0, -0.25, 0, arm)
      box(0.09, 0.48, 0.09, skinDark, 0, -0.72, 0.03, arm)
      for (const f of [-0.04, 0, 0.04]) box(0.025, 0.2, 0.025, bone, f, -1.03, 0.07, arm) // claws
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [torso, this.head, this.jaw, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  protected updateAnimations(deltaTime: number): void {
    const ease = (k: number, target: number, value: number) => value + (target - value) * Math.min(1, deltaTime * k)
    const shrieking = this.shriekTimer > 0
    let torsoX = 0.55
    let armX = 0
    let jawX = 0.1
    let eye = 0.5
    if (this.lurking) {
      torsoX = 0.95 // folded over in the niche
      armX = 0.3
      eye = 0.25
    } else if (shrieking) {
      torsoX = 0.1
      armX = -1.4
      jawX = 0.7
      eye = 1
    } else if (this.comboStage === 1) {
      armX = -2.7 // rears up, claws raised high over its head
      torsoX = 0.05
      jawX = 0.45
      eye = 1
    } else if (this.comboStage === 2 || this.comboStage === 3) {
      armX = 0.5
      torsoX = 0.75
      jawX = 0.5
      eye = 0.9
    }
    if (this.isWalking && this.comboStage === 0 && !this.lurking) this.walkPhase += deltaTime * 13
    const swing = this.isWalking && !this.lurking ? Math.sin(this.walkPhase) : 0
    if (this.torso) this.torso.rotation.x = ease(10, torsoX, this.torso.rotation.x)
    if (this.leftArm) this.leftArm.rotation.x = ease(14, armX + swing * 0.5, this.leftArm.rotation.x)
    if (this.rightArm) this.rightArm.rotation.x = ease(14, armX - swing * 0.5, this.rightArm.rotation.x)
    if (this.leftLeg) this.leftLeg.rotation.x = swing * 0.7
    if (this.rightLeg) this.rightLeg.rotation.x = -swing * 0.7
    if (this.jaw) this.jaw.rotation.x = ease(16, jawX, this.jaw.rotation.x)
    if (this.head) this.head.rotation.x = ease(8, this.lurking ? -0.4 : shrieking ? -0.6 : -0.35, this.head.rotation.x)
    if (this.eyeMaterial) this.eyeMaterial.color.setRGB(0.83 * eye, 1.0 * eye, 0.88 * eye)
  }

  override dispose(): void {
    this.hunterRef = null
    this.damageFn = null
    this.torso = null
    this.head = null
    this.jaw = null
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.eyeMaterial = null
    super.dispose()
  }
}
