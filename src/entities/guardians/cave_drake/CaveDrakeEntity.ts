import * as THREE from 'three'
import { GuardianEntity, guardianDrop, type GuardianAttack } from '../GuardianEntity.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { buildCaveDrakeModel, WING_REST, type CaveDrakeModel } from './CaveDrakeModel.ts'
import { CAVE_DRAKE_ID } from './caveDrakeIds.ts'

export { CAVE_DRAKE_ID, CAVE_DRAKE_INDEX } from './caveDrakeIds.ts'

const MAX_HEALTH = 600
/** The lair's cavern: ~15 blocks to the walls from the altar. */
const ARENA_RADIUS = 15

// Attack tuning (raw damage, before armour / potions)
const BITE_DAMAGE = 12
const SWEEP_DAMAGE = 9
const SWEEP_RADIUS = 5.5
const BREATH_DAMAGE = 4
const BUFFET_DAMAGE = 3
const BUFFET_RADIUS = 7.5
const RAIN_DAMAGE = 8
const ROAR_DAMAGE = 7

/** Phase 2 (below half health): faster, breathes longer, rains fire. */
const ENRAGED_SPEED_MULTIPLIER = 1.25

/** Neck lean at rest (rad, + = forward): the head carried low and ahead, not straight up. */
const NECK_REST = 0.35

const FIRE_IDLE = new THREE.Color(0x7a2a10)
const FIRE_HOT = new THREE.Color(0xffd27a)

/**
 * The Cave Drake - guardian of a dragon's lair, asleep on its altar in
 * front of the hoard until someone comes close.
 * - bite: a snapping lunge up close (the head draws back first)
 * - tail sweep: when the player is close or behind it, the tail lashes round
 *   and throws them back
 * - fire breath: it rears, its throat glows, then a stream of fire follows
 *   the player for a moment ('fire' damage: fire resistance stops it)
 * - wing buffet: wings snap open, a gust hurls everything away
 * - phase 2 (< 50 %): a roar and a ring of fire; faster, longer breath,
 *   and fireballs lobbed to rain down around the player
 * Its loot fills a chest on the spent altar: gold, diamonds, an Infernal
 * Heart and one of its eggs.
 */
export class CaveDrakeEntity extends GuardianEntity {
  private model: CaveDrakeModel | null = null
  private walkPhase = 0
  private idleTime = Math.random() * 10
  private breathGlow = 0
  private roarTime = 0
  private readonly scratch = new THREE.Vector3()
  private readonly fireColor = new THREE.Color()

  constructor(position: THREE.Vector3) {
    super({
      position,
      guardianId: CAVE_DRAKE_ID,
      displayName: 'The Cave Drake',
      maxHealth: MAX_HEALTH,
      hitboxSize: new THREE.Vector3(3.0, 3.6, 3.0),
      walkSpeed: 2.2,
      chaseSpeed: 3.4,
      jumpVelocity: 9.5,
      attackRange: 5.4,
      attackDamage: BITE_DAMAGE,
      attackCooldown: 0.6,
      attackKnockbackHorizontal: 7,
      attackKnockbackVertical: 3,
      phaseThresholds: [0.5],
      phaseTransitionTime: 1.8,
      arenaRadius: ARENA_RADIUS,
      arenaHeight: 12,
      knockbackResistance: 0.95,
      damageTakenMultiplier: 0.85,
      preferredRange: 4.4,
      turnSpeed: 3.2,
      maxMinions: 4,
      bossBarColor: '#c4361c',
      deathDuration: 3.2,
      projectileOrigin: new THREE.Vector3(0, 4.3, 5.0),
      drops: [
        guardianDrop('gold_bar', 6, 10),
        guardianDrop('diamond', 3, 6),
        guardianDrop('infernal_heart'),
        guardianDrop('dragon_egg_block'),
        guardianDrop('heaped_gold_block', 8, 12),
        guardianDrop('fire_resistance_potion_long', 1, 2),
      ],
    })
  }

  // ===========================================================================
  // Model
  // ===========================================================================

  protected createMesh(): THREE.Object3D {
    const model = buildCaveDrakeModel()
    this.model = model
    for (const material of model.litMaterials) this.registerMaterialForLighting(material)
    optimizeEntityMesh(model.root, {
      merge: true,
      dynamic: [model.body, model.neck, model.head, model.jaw, model.leftWing, model.rightWing, ...model.tail, ...model.legs],
      registerForLighting: (material) => this.registerMaterialForLighting(material),
    })
    return model.root
  }

  // ===========================================================================
  // Attacks
  // ===========================================================================

  protected defineAttacks(): GuardianAttack[] {
    return [
      {
        id: 'bite',
        cooldown: 1.6,
        windup: 0.55,
        recovery: 0.5,
        maxRange: 5.6,
        weight: 2.5,
        execute: () => {
          this.meleeStrike({ damage: BITE_DAMAGE, reach: 6.2, knockback: 6, knockbackUp: 3, arc: Math.PI * 0.55 })
        },
      },
      {
        id: 'sweep',
        cooldown: 5,
        initialCooldown: 2,
        windup: 0.6,
        recovery: 0.6,
        maxRange: SWEEP_RADIUS,
        weight: 1.5,
        execute: () => {
          this.areaStrike(this.scratch.set(this.position.x, this.position.y, this.position.z), SWEEP_RADIUS, SWEEP_DAMAGE, {
            knockback: 13,
            knockbackUp: 5,
            height: 2.5,
          })
        },
      },
      {
        id: 'breath',
        cooldown: 6,
        initialCooldown: 2.5,
        windup: 0.9,
        duration: 1.6,
        recovery: 0.7,
        minRange: 3.5,
        maxRange: 18,
        weight: 2,
        requiresLineOfSight: true,
        trackDuringWindup: true,
        onStart: () => {
          this.breathGlow = 1
        },
        execute: () => {
          this.breathPuff()
        },
        update: (dt, elapsed) => {
          const player = this.playerPosition
          if (player) this.faceToward(player, dt * 0.6)
          const length = this.phase >= 1 ? 2.2 : 1.6
          // A puff of fire every 0.12 s while the stream lasts
          if (elapsed < length && Math.floor(elapsed / 0.12) !== Math.floor((elapsed - dt) / 0.12)) this.breathPuff()
        },
        onEnd: () => {
          this.breathGlow = 0
        },
      },
      {
        id: 'buffet',
        cooldown: 9,
        initialCooldown: 4,
        windup: 0.8,
        recovery: 0.9,
        maxRange: BUFFET_RADIUS,
        execute: () => {
          this.areaStrike(this.scratch.set(this.position.x, this.position.y, this.position.z), BUFFET_RADIUS, BUFFET_DAMAGE, {
            knockback: 16,
            knockbackUp: 6,
            height: 4,
          })
        },
      },
      {
        id: 'rain',
        phases: [1],
        cooldown: 9,
        initialCooldown: 2,
        windup: 1.0,
        recovery: 0.8,
        maxRange: 30,
        execute: () => {
          const player = this.playerPosition
          if (!player) return
          // Fireballs lobbed high, coming down on and around the player
          for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2
            const dist = i === 0 ? 0 : 1.5 + Math.random() * 3.5
            const target = this.clampToArena(new THREE.Vector3(player.x + Math.sin(angle) * dist, player.y, player.z + Math.cos(angle) * dist), 1)
            this.spawnProjectile({ preset: 'fireball', target, speed: 9 + Math.random() * 3, gravity: 14, damage: RAIN_DAMAGE, scale: 1.2, knockback: 3, damageSource: 'fire' })
          }
        },
      },
    ]
  }

  /** One puff of the fire breath: a small fireball toward the player, a little spread. */
  private breathPuff(): void {
    this.spawnProjectile({ preset: 'fireball', speed: 17, damage: BREATH_DAMAGE, scale: 0.75, spread: 0.12, knockback: 1, lifetime: 1.4, damageSource: 'fire' })
  }

  protected onPhaseChanged(phase: number): void {
    if (phase < 1) return
    this.roarTime = 1.8
    this.spawnProjectileRing(12, { preset: 'fireball', speed: 10, damage: ROAR_DAMAGE, scale: 1.1, lifetime: 2.5, damageSource: 'fire' })
  }

  protected onReset(): void {
    this.breathGlow = 0
    this.roarTime = 0
  }

  /** Between attacks: stalk the player, faster when enraged, never leaving the lair. */
  protected updateMovement(deltaTime: number): void {
    const player = this.playerPosition
    if (!player) return
    this.faceToward(player, deltaTime)
    if (this.horizontalDistanceToPlayer() > this.preferredRange) {
      const speed = this.chaseSpeed * (this.phase >= 1 ? ENRAGED_SPEED_MULTIPLIER : 1)
      this.moveToward(this.clampToArena(this.scratch.copy(player)), speed, deltaTime)
    } else {
      this.stopMoving()
    }
  }

  // ===========================================================================
  // Animation
  // ===========================================================================

  protected updateAnimations(deltaTime: number): void {
    const m = this.model
    if (!m) return
    this.idleTime += deltaTime
    const walking = this.isWalking
    this.walkPhase += deltaTime * (walking ? (this.phase >= 1 ? 9 : 7) : 2)
    const stride = walking ? 0.55 : 0
    // Legs: diagonal pairs swing together
    m.legs[0].rotation.x = Math.sin(this.walkPhase) * stride
    m.legs[3].rotation.x = Math.sin(this.walkPhase) * stride
    m.legs[1].rotation.x = -Math.sin(this.walkPhase) * stride
    m.legs[2].rotation.x = -Math.sin(this.walkPhase) * stride
    // Breathing and tail sway
    const breathe = Math.sin(this.idleTime * 1.6)
    m.body.position.y = breathe * 0.03
    for (let i = 0; i < m.tail.length; i++) m.tail[i].rotation.y = Math.sin(this.idleTime * 1.3 - i * 0.7) * (0.12 + i * 0.05)

    const attack = this.activeAttackId
    const stage = this.attackStage
    const t = this.attackStageProgress
    let neckPitch = NECK_REST + breathe * 0.04
    let jawOpen = 0.05
    let wingSpread = 0
    let bodyTwist = 0
    if (attack === 'bite') {
      neckPitch = stage === 'windup' ? NECK_REST - 0.5 * t : stage === 'active' ? NECK_REST + 0.4 : NECK_REST + 0.4 * (1 - t)
      jawOpen = stage === 'windup' ? 0.6 * t : 0.1
    } else if (attack === 'breath') {
      neckPitch = stage === 'windup' ? NECK_REST - 0.55 * t : NECK_REST + 0.1
      jawOpen = stage === 'windup' ? 0.3 * t : 0.75
      wingSpread = 0.3
    } else if (attack === 'sweep') {
      bodyTwist = stage === 'windup' ? -0.4 * t : stage === 'active' || stage === 'recovery' ? 0.6 * (1 - t) : 0
      for (let i = 0; i < m.tail.length; i++) m.tail[i].rotation.y += bodyTwist * 1.6
    } else if (attack === 'buffet') {
      wingSpread = stage === 'windup' ? 1.3 * t : stage === 'recovery' ? 1.3 * (1 - t) : 1.3
    } else if (attack === 'rain') {
      neckPitch = NECK_REST - 0.8
      jawOpen = 0.6
      wingSpread = 0.8
    }
    if (this.roarTime > 0) {
      this.roarTime -= deltaTime
      neckPitch = NECK_REST - 0.9
      jawOpen = 0.9
      wingSpread = 1.2
    }
    m.neck.rotation.x = neckPitch
    m.jaw.rotation.x = jawOpen
    m.body.rotation.y = bodyTwist
    m.leftWing.rotation.z = WING_REST + wingSpread * 0.9 + (wingSpread > 0 ? Math.sin(this.idleTime * 9) * 0.08 : 0)
    m.rightWing.rotation.z = -m.leftWing.rotation.z
    // Throat and mouth glow
    const glowTarget = attack === 'breath' || this.roarTime > 0 || attack === 'rain' ? 1 : this.phase >= 1 ? 0.35 : 0
    this.breathGlow += (glowTarget - this.breathGlow) * Math.min(1, deltaTime * 6)
    m.fireMaterial.color.copy(this.fireColor.copy(FIRE_IDLE).lerp(FIRE_HOT, this.breathGlow))
  }

  protected updateDeathAnimation(deltaTime: number, t: number): void {
    const m = this.model
    if (!m) return
    // Neck sags and the jaw falls open as it rolls onto its side
    m.neck.rotation.x = 0.4 * t
    m.jaw.rotation.x = 0.5
    super.updateDeathAnimation(deltaTime, t)
  }
}
