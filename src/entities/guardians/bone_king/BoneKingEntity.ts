import * as THREE from 'three'
import { GuardianEntity, guardianDrop, type GuardianAttack } from '../GuardianEntity.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { SkeletonEntity } from '../../enemies/skeleton/SkeletonEntity.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { getPlayerAttackCharge } from '../../../combat/PlayerAttack.ts'
import type { IItem } from '../../../items/Item.ts'
import { buildBoneKingModel, BONE_SHIELD_SHARDS, type BoneKingModel } from './BoneKingModel.ts'

/** Guardian id (DESIGN §11) and spawner index (DESIGN §7). */
export const BONE_KING_ID = 'bone_king'
export const BONE_KING_INDEX = 2
export const BONE_KING_NAME = 'The Bone King'

const MAX_HEALTH = 520

// Scepter slam (melee): a telegraphed overhead blow that cracks the floor
// in front of him
const SLAM_DAMAGE = 12
const SLAM_RADIUS = 2.6
const SLAM_REACH = 1.8

// Bone-shard volley: a fan of shards from the casting hand
const VOLLEY_DAMAGE = 8
const VOLLEY_SPEED = 15

// Bone nova (last phase): a knee-high ring of shards - jump it
const NOVA_DAMAGE = 7
const NOVA_SHARDS = 14

// Bone shield: orbiting shards that soak 80% of each hit; every landed
// charged hit shatters one, and shattering the last leaves him exposed
const SHIELD_DURATION = 12
const SHIELD_DAMAGE_TAKEN = 0.2
/** Attack charge a hit needs to shatter a shard (spam-clicks only chip him). */
const SHIELD_BREAK_CHARGE = 0.8
const EXPOSED_TIME = 4
const EXPOSED_DAMAGE_TAKEN = 1.3
const SHIELD_CONTACT_DAMAGE = 4
const SHIELD_CONTACT_RADIUS = 2.3
const SHIELD_CONTACT_INTERVAL = 0.9

const SOUL = new THREE.Color(0x7dffa6)
const SOUL_HOT = new THREE.Color(0xe6fff0)
const SOUL_DEAD = new THREE.Color(0x1b2a20)

/**
 * The Bone King - guardian of the Catacombs (index 2), a towering crowned
 * skeleton with a soul-fire heart, a skull-topped scepter and a royal cape.
 *
 * Attacks (each with a readable telegraph):
 * - Scepter slam: raises the scepter overhead (0.85 s), smashes the floor in
 *   front of him - 12 damage + heavy knockback in a 2.6-block circle.
 * - Bone volley: a soul orb swells in his left hand (0.9 s), then a fan of
 *   5 (7 from phase 1) bone shards, 8 damage each.
 * - Raise the dead: arms spread, soul fire flares on the floor where 2-3
 *   skeletons claw out of the ground (1.4 s).
 * - Bone shield (phases 1-2, also raised on each phase change): five
 *   orbiting shards soak 80% of every hit and cut anyone hugging him; each
 *   landed hit at >= 80% attack charge shatters one (spam-clicking does
 *   not), the last leaves him exposed (+30% damage, 4 s).
 * - Bone nova (phase 2): hunches, heart blazing (1.1 s), then a knee-high
 *   ring of 14 shards - jump over it or eat 7.
 * Phases at 66% and 33%. Drops: Bone Sigil, Infernal Heart, soul shards,
 * gold, bones, ectoplasm, sometimes diamonds.
 */
export class BoneKingEntity extends GuardianEntity {
  private model: BoneKingModel | null = null
  private walkPhase = 0
  private idlePhase = Math.random() * Math.PI * 2

  // Bone shield
  private shieldShards = 0
  private shieldTimer = 0
  private shieldContactTimer = 0
  private exposedTimer = 0
  private shieldSpin = 0
  /** Attack charge of the player hit being applied (1 outside a player hit). */
  private incomingHitCharge = 1

  // Raise-the-dead spots chosen at the start of the windup
  private readonly graveSpots: THREE.Vector3[] = []

  private readonly tmp = new THREE.Vector3()

  constructor(position: THREE.Vector3) {
    super({
      position,
      guardianId: BONE_KING_ID,
      displayName: BONE_KING_NAME,
      maxHealth: MAX_HEALTH,
      hitboxSize: new THREE.Vector3(1.4, 3.6, 1.4),
      chaseSpeed: 3.2,
      walkSpeed: 2.0,
      attackRange: 3.2,
      attackDamage: SLAM_DAMAGE,
      attackCooldown: 0.9,
      attackKnockbackHorizontal: 8,
      attackKnockbackVertical: 5,
      phaseThresholds: [0.66, 0.33],
      phaseTransitionTime: 1.4,
      arenaRadius: 17,
      arenaHeight: 8,
      maxMinions: 4,
      bossBarColor: '#8fe0a2',
      deathDuration: 3,
      projectileOrigin: new THREE.Vector3(-0.6, 2.3, 0.7),
      drops: [
        guardianDrop('bone_sigil', 2),
        guardianDrop('infernal_heart'),
        guardianDrop('soul_shard', 3, 6),
        guardianDrop('gold_bar', 2, 4),
        guardianDrop('bone', 6, 12),
        guardianDrop('ectoplasm', 1, 3),
        guardianDrop('diamond', 0, 2),
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const model = buildBoneKingModel()
    this.model = model
    for (const material of model.litMaterials) this.registerMaterialForLighting(material)
    optimizeEntityMesh(model.root, {
      merge: true,
      dynamic: [
        model.upper, model.head, model.jaw, model.leftArm, model.rightArm, model.leftLeg, model.rightLeg,
        model.castOrb, model.scepterOrb, model.shield, ...model.shieldShards, ...model.graveMarkers,
      ],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return model.root
  }

  protected defineAttacks(): GuardianAttack[] {
    return [
      {
        id: 'slam',
        cooldown: 3.2,
        windup: 0.85,
        recovery: 0.6,
        maxRange: 4.2,
        weight: 2,
        execute: () => {
          const c = this.tmp.set(
            this.position.x + Math.sin(this.facing) * SLAM_REACH,
            this.position.y,
            this.position.z + Math.cos(this.facing) * SLAM_REACH
          )
          this.areaStrike(c, SLAM_RADIUS, SLAM_DAMAGE, { knockback: 8, knockbackUp: 5 })
        },
      },
      {
        id: 'volley',
        cooldown: 4.5,
        initialCooldown: 2,
        windup: 0.9,
        recovery: 0.5,
        minRange: 3.5,
        maxRange: 26,
        requiresLineOfSight: true,
        weight: 2,
        execute: () => {
          this.spawnProjectileFan(this.phase >= 1 ? 7 : 5, Math.PI / 3, {
            preset: 'bone_shard',
            speed: VOLLEY_SPEED,
            damage: VOLLEY_DAMAGE,
            scale: 1.4,
          })
        },
      },
      {
        id: 'raise_dead',
        cooldown: 16,
        initialCooldown: 6,
        windup: 1.4,
        recovery: 0.6,
        maxRange: 30,
        trackDuringWindup: false,
        canUse: () => this.minionCount < (this.phase >= 2 ? 4 : 3),
        onStart: () => this.chooseGraveSpots(this.phase >= 1 ? 3 : 2),
        execute: () => this.raiseDead(),
        onEnd: () => this.hideGraveMarkers(),
      },
      {
        id: 'bone_shield',
        cooldown: 22,
        windup: 0.8,
        recovery: 0.4,
        maxRange: 40,
        phases: [1, 2],
        canUse: () => this.shieldShards === 0 && this.exposedTimer <= 0,
        execute: () => this.raiseShield(),
      },
      {
        id: 'nova',
        cooldown: 9,
        initialCooldown: 3,
        windup: 1.1,
        recovery: 0.7,
        maxRange: 30,
        phases: [2],
        execute: () => {
          this.spawnProjectileRing(NOVA_SHARDS, {
            preset: 'bone_shard',
            speed: 11,
            damage: NOVA_DAMAGE,
            scale: 1.3,
            from: this.tmp.set(this.position.x, this.position.y + 0.9, this.position.z).clone(),
          })
        },
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Bone shield
  // ---------------------------------------------------------------------------

  private raiseShield(): void {
    this.shieldShards = BONE_SHIELD_SHARDS
    this.shieldTimer = SHIELD_DURATION
    this.shieldContactTimer = SHIELD_CONTACT_INTERVAL
    this.exposedTimer = 0
    this.syncShieldMesh()
  }

  private dropShield(): void {
    this.shieldShards = 0
    this.shieldTimer = 0
    this.syncShieldMesh()
  }

  private syncShieldMesh(): void {
    const model = this.model
    if (!model) return
    model.shield.visible = this.shieldShards > 0
    model.shieldShards.forEach((shard, i) => {
      shard.visible = i < this.shieldShards
    })
  }

  /** Remember the hit's attack charge (read before the hit restarts the cooldown). */
  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    this.incomingHitCharge = getPlayerAttackCharge(heldItem)
    try {
      return super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    } finally {
      this.incomingHitCharge = 1
    }
  }

  /**
   * The shield soaks hits (and loses a shard per charged hit); a broken
   * shield leaves him exposed.
   */
  override applyDamage(amount: number, from?: THREE.Vector3): boolean {
    if (this.shieldShards > 0 && !this.isInvulnerable && this.isAlive && !this.isDying && amount > 0) {
      const dealt = super.applyDamage(amount * SHIELD_DAMAGE_TAKEN, from)
      if (dealt && this.shieldShards > 0 && this.incomingHitCharge >= SHIELD_BREAK_CHARGE) {
        this.shieldShards--
        if (this.shieldShards === 0) {
          this.shieldTimer = 0
          this.exposedTimer = EXPOSED_TIME
        }
        this.syncShieldMesh()
      }
      return dealt
    }
    const multiplier = this.exposedTimer > 0 ? EXPOSED_DAMAGE_TAKEN : 1
    return super.applyDamage(amount * multiplier, from)
  }

  // ---------------------------------------------------------------------------
  // Raise the dead
  // ---------------------------------------------------------------------------

  /** Pick open floor cells around him (feet cell + head room clear, solid below). */
  private chooseGraveSpots(count: number): void {
    this.graveSpots.length = 0
    const baseY = Math.floor(this.position.y)
    for (let attempt = 0; attempt < 24 && this.graveSpots.length < count; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const r = 2.5 + Math.random() * 3
      const p = this.clampToArena(this.tmp.set(this.position.x + Math.sin(angle) * r, 0, this.position.z + Math.cos(angle) * r), 1.5)
      const x = Math.floor(p.x)
      const z = Math.floor(p.z)
      for (let y = baseY + 1; y >= baseY - 3; y--) {
        if (!this.isSolidAt(x, y, z) && !this.isSolidAt(x, y + 1, z) && this.isSolidAt(x, y - 1, z)) {
          if (!this.graveSpots.some((s) => Math.abs(s.x - (x + 0.5)) < 1.5 && Math.abs(s.z - (z + 0.5)) < 1.5)) {
            this.graveSpots.push(new THREE.Vector3(x + 0.5, y, z + 0.5))
          }
          break
        }
      }
    }
    // Soul fire flares where the dead will rise (root-local: undo facing)
    const model = this.model
    if (!model) return
    const sin = Math.sin(-this.facing)
    const cos = Math.cos(-this.facing)
    model.graveMarkers.forEach((marker, i) => {
      const spot = this.graveSpots[i]
      marker.visible = !!spot
      if (!spot) return
      const dx = spot.x - this.position.x
      const dz = spot.z - this.position.z
      marker.position.set(dx * cos + dz * sin, spot.y - this.position.y, -dx * sin + dz * cos)
      marker.scale.setScalar(0.2)
    })
  }

  private raiseDead(): void {
    for (const spot of this.graveSpots) {
      this.spawnMinion(new SkeletonEntity({ position: spot.clone().setY(spot.y + 0.05) }))
    }
    this.hideGraveMarkers()
  }

  private hideGraveMarkers(): void {
    this.graveSpots.length = 0
    for (const marker of this.model?.graveMarkers ?? []) marker.visible = false
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks
  // ---------------------------------------------------------------------------

  protected override onPhaseChanged(phase: number): void {
    // Each phase opens with a roar: the bone shield rises, and the last phase
    // chills the player
    this.raiseShield()
    if (phase >= 2) this.applyEffectToPlayer(StatusEffectIds.SLOWNESS, 3, 1)
  }

  protected override onDisengage(): void {
    this.dropShield()
    this.exposedTimer = 0
    this.hideGraveMarkers()
  }

  protected override onDefeated(): void {
    this.dropShield()
    this.hideGraveMarkers()
  }

  override update(deltaTime: number): void {
    super.update(deltaTime)
    if (!this.isAlive || this.isDying) return

    this.exposedTimer = Math.max(0, this.exposedTimer - deltaTime)
    if (this.shieldShards > 0) {
      this.shieldTimer -= deltaTime
      if (this.shieldTimer <= 0) {
        this.dropShield()
      } else if (this.isEngaged) {
        // The orbiting shards cut anyone who hugs him
        this.shieldContactTimer -= deltaTime
        const player = this.playerPosition
        if (
          this.shieldContactTimer <= 0 && player &&
          this.horizontalDistanceToPlayer() <= SHIELD_CONTACT_RADIUS &&
          player.y < this.position.y + 3.2 && player.y > this.position.y - 1.5
        ) {
          this.damagePlayer(SHIELD_CONTACT_DAMAGE, 5, 'melee', 3)
          this.shieldContactTimer = SHIELD_CONTACT_INTERVAL
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  protected updateAnimations(deltaTime: number): void {
    const m = this.model
    if (!m) return
    this.idlePhase += deltaTime * 1.6
    const attack = this.activeAttackId
    const stage = this.attackStage
    const p = this.attackStageProgress
    const windup = stage === 'windup'
    const ease = (k: number, target: number, value: number) => value + (target - value) * Math.min(1, deltaTime * k)

    // Legs
    if (this.isWalking) {
      this.walkPhase += deltaTime * 6
      m.leftLeg.rotation.x = Math.sin(this.walkPhase) * 0.45
      m.rightLeg.rotation.x = -Math.sin(this.walkPhase) * 0.45
    } else {
      m.leftLeg.rotation.x = ease(8, 0, m.leftLeg.rotation.x)
      m.rightLeg.rotation.x = ease(8, 0, m.rightLeg.rotation.x)
    }

    // Arm / body targets per attack stage (arm z: the left arm swings out
    // with negative angles, the right arm with positive ones)
    let rightX = this.isWalking ? -Math.sin(this.walkPhase) * 0.25 : 0.05 * Math.sin(this.idlePhase)
    let leftX = this.isWalking ? Math.sin(this.walkPhase) * 0.25 : -0.05 * Math.sin(this.idlePhase)
    let leftZ = 0
    let rightZ = 0
    let lean = 0.04 * Math.sin(this.idlePhase * 0.5)
    let jawOpen = 0.05
    let glow = 0.35 + 0.15 * Math.sin(this.idlePhase * 2)
    let orbScale = 0.001
    let scepterOrb = 1

    if (attack === 'slam') {
      // Scepter hauled overhead and out to the side, its soul orb swelling
      if (windup) { rightX = -2.8 * Math.min(1, p * 1.5); rightZ = 0.35; lean = -0.3 * p; jawOpen = 0.35 * p; glow = 0.5 + 0.5 * p; scepterOrb = 1 + 2.2 * p }
      else if (stage === 'active' || (stage === 'recovery' && p < 0.5)) { rightX = 0.35; lean = 0.3; jawOpen = 0.4; glow = 1; scepterOrb = 2 }
    } else if (attack === 'volley') {
      if (windup) { leftX = -1.6; leftZ = -0.2; orbScale = 0.3 + 1.6 * p; glow = 0.4 + 0.6 * p; jawOpen = 0.25 }
      else if (stage === 'active' || stage === 'recovery') { leftX = -1.3; lean = 0.1 }
    } else if (attack === 'raise_dead') {
      // Arms flung wide and high, head thrown back: the dead answer
      if (windup) { leftX = -0.5; rightX = -0.5; leftZ = -1.5 * Math.min(1, p * 1.6); rightZ = 1.5 * Math.min(1, p * 1.6); lean = -0.3; jawOpen = 0.6 * p; glow = 0.5 + 0.5 * p }
    } else if (attack === 'bone_shield') {
      if (windup) { leftX = -1.2; rightX = -1.2; leftZ = 0.6; rightZ = -0.6; lean = 0.1; glow = 0.4 + 0.6 * p }
    } else if (attack === 'nova') {
      if (windup) { lean = 0.45 * p; leftZ = -0.4; rightZ = 0.4; jawOpen = 0.45 * p; glow = 0.5 + 0.5 * p }
      else if (stage === 'active' || stage === 'recovery') { lean = -0.15; leftZ = -1.4; rightZ = 1.4; glow = 1 }
    }
    if (this.isTransitioning) { leftZ = -1.1; rightZ = 1.1; leftX = -0.6; rightX = -0.6; lean = -0.25; jawOpen = 0.55; glow = 1 }

    m.rightArm.rotation.x = ease(windup ? 6 : 14, rightX, m.rightArm.rotation.x)
    m.leftArm.rotation.x = ease(windup ? 6 : 14, leftX, m.leftArm.rotation.x)
    m.leftArm.rotation.z = ease(8, leftZ, m.leftArm.rotation.z)
    m.rightArm.rotation.z = ease(8, rightZ, m.rightArm.rotation.z)
    m.upper.rotation.x = ease(8, lean, m.upper.rotation.x)
    m.jaw.rotation.x = ease(10, jawOpen, m.jaw.rotation.x)
    m.head.rotation.y = 0.08 * Math.sin(this.idlePhase * 0.7)
    m.castOrb.scale.setScalar(Math.max(0.001, orbScale))
    m.scepterOrb.scale.setScalar(ease(10, scepterOrb, m.scepterOrb.scale.x))

    // Soul glow (eyes, heart, gems): brighter as attacks wind up
    const color = this.tmpColor.copy(SOUL).lerp(SOUL_HOT, Math.max(0, glow - 0.5) * 2)
    color.multiplyScalar(0.55 + 0.45 * Math.min(1, glow * 1.6))
    for (const material of m.glowMaterials) material.color.copy(color)

    // Shield shards orbit; the exposed king's heart gutters
    if (m.shield.visible) {
      this.shieldSpin += deltaTime * 2.2
      m.shield.rotation.y = this.shieldSpin - this.facing
    }
    if (this.exposedTimer > 0) {
      const flicker = 0.5 + 0.5 * Math.sin(this.idlePhase * 20)
      for (const material of m.glowMaterials) material.color.lerp(SOUL_DEAD, 0.5 * flicker)
    }

    // Grave markers grow as the dead are summoned
    if (attack === 'raise_dead' && windup) {
      for (const marker of m.graveMarkers) if (marker.visible) marker.scale.setScalar(0.3 + 0.9 * p)
    }
  }

  private readonly tmpColor = new THREE.Color()

  protected override updateDeathAnimation(_deltaTime: number, t: number): void {
    const m = this.model
    const mesh = this.getMesh()
    if (!m || !mesh) return
    // Kneels, then collapses into a heap of bones; the soul fire dies
    const kneel = Math.min(1, t / 0.3)
    m.upper.rotation.x = 0.5 * kneel
    m.leftArm.rotation.x = -0.4 * kneel
    m.rightArm.rotation.x = -0.2 * kneel
    m.jaw.rotation.x = 0.6 * kneel
    const collapse = Math.max(0, (t - 0.3) / 0.7)
    mesh.scale.set(1 + 0.25 * collapse, 1 - 0.75 * collapse, 1 + 0.25 * collapse)
    mesh.position.y = this.position.y - 0.2 * collapse
    for (const material of m.glowMaterials) material.color.copy(SOUL).lerp(SOUL_DEAD, Math.min(1, t * 1.5))
  }

  override dispose(): void {
    this.model = null
    this.graveSpots.length = 0
    super.dispose()
  }
}
