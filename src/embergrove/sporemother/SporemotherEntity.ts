import * as THREE from 'three'
import { GuardianEntity, guardianDrop, type GuardianAttack } from '../../entities/guardians/GuardianEntity.ts'
import { StatusEffectIds } from '../../player/effects/StatusEffects.ts'
import { SporeStalkerEntity } from '../../entities/enemies/spore_stalker/index.ts'
import { optimizeEntityMesh } from '../../entities/EntityMeshOptimizer.ts'
import {
  buildSporemotherModel,
  AURA_RADIUS,
  ERUPT_RADIUS,
  SLAM_OFFSET,
  SLAM_RADIUS,
  type SporemotherParts,
} from './SporemotherModel.ts'

/** Guardian id (`guardian-defeated.guardianId`) and spawner index (DESIGN §7/§11). */
export const SPOREMOTHER_ID = 'sporemother'
export const SPOREMOTHER_INDEX = 3

const TEAL = 0x5ae6cc
const EMBER_EYE = 0xffb040

// Tuning (DESIGN §7: 350-550 HP, hits 8-14, ~45-90 s in diamond/infernium gear)
const MAX_HEALTH = 520
/**
 * While rooted her woody bark shrugs off part of every blow: phase 1 takes
 * longer, and uprooting her is the turning point of the fight. (A flawless
 * infernium-sword player measured ~30 s on 480 HP with no armor at all.)
 */
const ROOTED_DAMAGE_TAKEN = 0.65
const SLAM_DAMAGE = 12
const GLOB_DAMAGE = 8
const BURST_DAMAGE = 6
const ERUPT_DAMAGE = 10
const UPROOT_DAMAGE = 6
/** Phase 2: poison while the player stands inside the spore aura. */
const AURA_TICK = 1.0
const AURA_POISON_SECONDS = 2.5

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t)

/**
 * The Sporemother - guardian of the Sporeheart Hive (index 3).
 *
 * A colossal fungal matriarch rooted to the heart chamber's altar.
 * Phase 1 (rooted, 100-50%): she never moves, only turns, and her bark
 * takes only 65% of every hit.
 * - Spore glob: a lobbed glob of spores (8 + poison 4 s). Telegraph: the cap
 *   swells and the gills flare, the body rears back.
 * - Tendril slam: front tendrils rise overhead while a teal disc glows on
 *   the floor in front of her, then crash down (12, heavy knockback).
 * - Spore burst: the body swells, every sac flashes, then a slow ring of
 *   spore globs rolls outward (6 + poison 3 s each) - punishes hugging.
 * - Brood: roots quiver and two spore stalkers crawl out at the chamber's
 *   edge (at most 3 alive).
 * Phase 2 (uprooted, below 50%): a 2.2 s invulnerable uproot (she shakes,
 * tears her roots free and heaves the ground: 6 + knockback), then she
 * walks after the player wrapped in a poison spore aura, and adds:
 * - Glob volley: a fan of three globs.
 * - Root eruption: a disc glows under the player's feet; 1.3 s later roots
 *   burst up through it (10 + launch).
 * Drops (into the reward chest): 2 spore sigils, infernal heart, glowcaps,
 * emberwood and diamonds.
 */
export class SporemotherEntity extends GuardianEntity {
  private parts: SporemotherParts | null = null
  private time = Math.random() * 10
  /** 0 rooted .. 1 uprooted (animated). */
  private uproot = 0
  private pendingUprootBlast = false
  private auraTimer = 0
  private readonly eruptTarget = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()

  constructor(position: THREE.Vector3) {
    super({
      position,
      guardianId: SPOREMOTHER_ID,
      displayName: 'The Sporemother',
      maxHealth: MAX_HEALTH,
      // Modest hitbox (the cap is ~4.4 wide): melee targeting needs ≤ ~4
      hitboxSize: new THREE.Vector3(2.4, 4.2, 2.4),
      chaseSpeed: 3.2,
      walkSpeed: 1.6,
      attackRange: 4,
      attackDamage: SLAM_DAMAGE,
      attackCooldown: 0.9,
      attackKnockbackHorizontal: 9,
      attackKnockbackVertical: 5,
      phaseThresholds: [0.5],
      phaseTransitionTime: 2.2,
      // The heart chamber (radius 8) and its gate
      arenaRadius: 11,
      arenaHeight: 10,
      knockbackResistance: 0.95,
      maxMinions: 3,
      preferredRange: 2.8,
      turnSpeed: 3.2,
      bossBarColor: '#3fc8b0',
      projectileOrigin: new THREE.Vector3(0, 2.2, 1.3),
      deathDuration: 3,
      drops: [
        guardianDrop('spore_sigil', 2), // DESIGN2: every guardian yields 2 sigils
        guardianDrop('infernal_heart'),
        guardianDrop('glowcap', 4, 8),
        guardianDrop('emberwood_stem_block', 4, 8),
        guardianDrop('spore_sac_block', 2, 4),
        guardianDrop('diamond', 1, 3),
      ],
    })
  }

  // ---------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------

  protected createMesh(): THREE.Object3D {
    const parts = buildSporemotherModel()
    this.parts = parts
    for (const material of parts.litMaterials) this.registerMaterialForLighting(material)
    optimizeEntityMesh(parts.root, {
      merge: true,
      dynamic: [parts.body, parts.cap, ...parts.arms, ...parts.roots, parts.slamMarker, parts.eruptMarker, parts.aura],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return parts.root
  }

  // ---------------------------------------------------------------------------
  // Attacks
  // ---------------------------------------------------------------------------

  protected defineAttacks(): GuardianAttack[] {
    return [
      {
        id: 'spore_glob',
        cooldown: 2.8,
        windup: 0.8,
        recovery: 0.5,
        minRange: 3,
        maxRange: 22,
        phases: [0],
        weight: 1.3,
        requiresLineOfSight: true,
        execute: () => this.fireGlobs(1),
      },
      {
        id: 'glob_volley',
        cooldown: 4.5,
        windup: 0.9,
        recovery: 0.6,
        minRange: 2,
        maxRange: 22,
        phases: [1],
        requiresLineOfSight: true,
        execute: () => this.fireGlobs(3),
      },
      {
        id: 'tendril_slam',
        cooldown: 3.8,
        windup: 1.1,
        duration: 0.25,
        recovery: 0.8,
        maxRange: SLAM_OFFSET + SLAM_RADIUS,
        weight: 1.6,
        execute: () => {
          const center = this.slamCenter(this.scratch)
          this.areaStrike(center, SLAM_RADIUS, SLAM_DAMAGE, { knockback: 9, knockbackUp: 5 })
        },
      },
      {
        id: 'spore_burst',
        cooldown: 9,
        initialCooldown: 6,
        windup: 1.4,
        recovery: 0.7,
        maxRange: 10,
        execute: () => {
          this.spawnProjectileRing(10, {
            preset: 'spore_glob',
            from: this.scratch.set(this.position.x, this.position.y + 1.2, this.position.z),
            speed: 7,
            damage: BURST_DAMAGE,
            effect: { id: StatusEffectIds.POISON, seconds: 3 },
            lifetime: 1.9,
            scale: 1.1,
          })
        },
      },
      {
        id: 'brood',
        cooldown: 16,
        initialCooldown: 9,
        windup: 1.6,
        recovery: 0.6,
        maxRange: 30,
        canUse: () => this.minionCount < (this.phase === 0 ? 2 : 3),
        execute: () => this.summonBrood(2),
      },
      {
        id: 'root_eruption',
        cooldown: 6,
        initialCooldown: 2,
        windup: 1.3,
        duration: 0.2,
        recovery: 0.5,
        maxRange: 14,
        phases: [1],
        weight: 1.3,
        trackDuringWindup: false,
        onStart: () => {
          const player = this.playerPosition
          if (player) this.eruptTarget.copy(player)
          else this.eruptTarget.copy(this.position)
        },
        execute: () => {
          this.areaStrike(this.eruptTarget, ERUPT_RADIUS, ERUPT_DAMAGE, { knockback: 2, knockbackUp: 9, height: 2.5 })
        },
      },
    ]
  }

  private fireGlobs(count: number): void {
    const options = {
      preset: 'spore_glob' as const,
      speed: 11,
      gravity: 18,
      damage: GLOB_DAMAGE,
      effect: { id: StatusEffectIds.POISON, seconds: 4 },
      scale: 1.3,
      lifetime: 5,
    }
    if (count <= 1) this.spawnProjectile(options)
    else this.spawnProjectileFan(count, 0.55, options)
  }

  /** Two spore stalkers crawl out at the chamber's edge (clear floor spots). */
  private summonBrood(count: number): void {
    const base = Math.random() * Math.PI * 2
    let spawned = 0
    for (let k = 0; k < 12 && spawned < count; k++) {
      const angle = base + k * 2.4
      const x = this.home.x + Math.sin(angle) * 5.5
      const z = this.home.z + Math.cos(angle) * 5.5
      const feet = this.home.y - 1
      if (this.isSolidAt(x, feet + 0.1, z) || this.isSolidAt(x, feet + 1.1, z) || this.isSolidAt(x, feet + 2, z)) continue
      if (!this.isSolidAt(x, feet - 0.5, z)) continue
      if (this.spawnMinion(new SporeStalkerEntity({ position: new THREE.Vector3(x, feet + 0.05, z) }))) spawned++
    }
  }

  private slamCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.position.x + Math.sin(this.facing) * SLAM_OFFSET,
      this.position.y,
      this.position.z + Math.cos(this.facing) * SLAM_OFFSET
    )
  }

  // ---------------------------------------------------------------------------
  // Phases and movement
  // ---------------------------------------------------------------------------

  /** Rooted bark: hits in phase 1 deal ROOTED_DAMAGE_TAKEN of their damage. */
  applyDamage(amount: number, from?: THREE.Vector3): boolean {
    return super.applyDamage(this.phase === 0 ? amount * ROOTED_DAMAGE_TAKEN : amount, from)
  }

  protected onPhaseChanged(phase: number): void {
    if (phase >= 1) this.pendingUprootBlast = true
  }

  protected onReset(): void {
    this.pendingUprootBlast = false
  }

  /** Rooted in phase 1 (turns only); uprooted she walks after the player. */
  protected updateMovement(deltaTime: number): void {
    if (this.phase === 0) {
      const player = this.playerPosition
      if (player) this.faceToward(player, deltaTime)
      this.stopMoving()
      return
    }
    super.updateMovement(deltaTime)
  }

  protected updateCombat(deltaTime: number): void {
    if (this.pendingUprootBlast) {
      // The uproot is done: the ground heaves around her
      this.pendingUprootBlast = false
      this.areaStrike(this.position, 5, UPROOT_DAMAGE, { knockback: 11, knockbackUp: 6 })
    }
    if (this.phase >= 1) {
      this.auraTimer -= deltaTime
      if (this.auraTimer <= 0) {
        this.auraTimer = AURA_TICK
        const player = this.playerPosition
        if (player && this.horizontalDistanceToPlayer() < AURA_RADIUS && Math.abs(player.y - this.position.y) < 4) {
          this.applyEffectToPlayer(StatusEffectIds.POISON, AURA_POISON_SECONDS, 1)
        }
      }
    }
    super.updateCombat(deltaTime)
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  protected updateAnimations(deltaTime: number): void {
    const p = this.parts
    if (!p) return
    this.time += deltaTime
    const t = this.time
    const id = this.activeAttackId
    const stage = this.attackStage
    const k = this.attackStageProgress
    const windup = (attack: string): number => (id === attack && stage === 'windup' ? k : 0)

    // Uproot: 0 rooted .. 1 free (driven through the phase transition)
    const uprootTarget = this.phase >= 1 ? 1 : 0
    const rate = this.isTransitioning ? 0.55 : 1.5
    this.uproot += THREE.MathUtils.clamp(uprootTarget - this.uproot, -rate * deltaTime, rate * deltaTime)
    const shaking = this.isTransitioning ? 1 : 0
    const free = this.uproot

    // Body: breathing bob, sits lower while rooted, shakes while tearing free
    const bob = Math.sin(t * 1.6) * 0.05
    p.body.position.y = 0.25 + 0.3 * free + bob - 0.25 * windup('brood')
    p.body.rotation.z = shaking * Math.sin(t * 38) * 0.06
    let lean = 0
    lean -= 0.2 * windup('spore_glob') + 0.2 * windup('glob_volley') + 0.15 * windup('tendril_slam')
    lean += 0.25 * windup('root_eruption')
    if (stage === 'active' || stage === 'recovery') {
      if (id === 'tendril_slam') lean = 0.25 * (stage === 'active' ? 1 : 1 - k)
      if (id === 'spore_glob' || id === 'glob_volley') lean = 0.18 * (stage === 'active' ? 1 : 1 - k)
    }
    p.body.rotation.x = lean
    const swell = 1 + 0.15 * windup('spore_burst')
    p.body.scale.set(swell, swell, swell)

    // Cap: breathes, puffs before glob spits, rises before a burst
    const puff = 1 + 0.15 * Math.max(windup('spore_glob'), windup('glob_volley')) + 0.03 * Math.sin(t * 1.1)
    p.cap.scale.set(puff, 1, puff)
    p.cap.position.y = 3.2 + 0.3 * windup('spore_burst')

    // Tendril arms: idle sway; slam raises the front pair overhead and crashes down
    for (let i = 0; i < p.arms.length; i++) {
      const arm = p.arms[i]
      let x = Math.sin(t * 1.3 + i * 1.7) * 0.12
      let z = (i % 2 === 0 ? -0.35 : 0.35) * (1 + 0.15 * Math.sin(t * 0.9 + i))
      const front = i < 2
      if (id === 'tendril_slam' && front) {
        if (stage === 'windup') x = -2.6 * easeOut(k)
        else if (stage === 'active') x = -0.9
        else if (stage === 'recovery') x = -0.9 * (1 - k)
      } else if (id === 'root_eruption' && front) {
        if (stage === 'windup') x = 0.5 * k
      } else if (id === 'brood') {
        z *= 1 + 1.6 * windup('brood')
      } else if (shaking) {
        x += Math.sin(t * 22 + i) * 0.4
      }
      if (this.phase >= 1 && this.isWalking && !id) x += Math.sin(t * 5 + i * Math.PI) * 0.25
      arm.rotation.x = x
      arm.rotation.z = z
    }

    // Roots: dug in while rooted (quiver when summoning), lifted and walking once free
    for (let i = 0; i < p.roots.length; i++) {
      const root = p.roots[i]
      let x = -0.55 * free
      if (this.isWalking && free > 0.5) x += Math.sin(t * 6 + i * 1.3) * 0.35
      x += windup('brood') * Math.sin(t * 30 + i) * 0.15
      x += shaking * Math.sin(t * 26 + i * 2) * 0.3
      root.rotation.x = x
    }

    // Glow: steady pulse, flaring with spore attacks
    const flare = Math.max(windup('spore_burst') * (0.6 + 0.4 * Math.sin(t * 24)), windup('spore_glob'), windup('glob_volley'))
    const glow = (0.75 + 0.25 * Math.sin(t * 2.2)) * (1 + 0.8 * flare)
    p.glow.color.setHex(TEAL).multiplyScalar(Math.min(1.6, glow))
    p.eyeGlow.color.setHex(EMBER_EYE).multiplyScalar(this.isEngaged ? 1 : 0.55)

    // Telegraph: slam impact disc in front
    const slamShow = id === 'tendril_slam' && (stage === 'windup' || stage === 'active')
    p.slamMarker.visible = slamShow
    if (slamShow) {
      p.slamMaterial.opacity = stage === 'active' ? 1 : 0.25 + 0.55 * k * (0.75 + 0.25 * Math.sin(t * 18))
    }

    // Telegraph: root eruption disc under the player's (remembered) feet
    const eruptShow = id === 'root_eruption' && (stage === 'windup' || stage === 'active')
    p.eruptMarker.visible = eruptShow
    if (eruptShow) {
      const dx = this.eruptTarget.x - this.position.x
      const dz = this.eruptTarget.z - this.position.z
      const c = Math.cos(this.facing)
      const s = Math.sin(this.facing)
      p.eruptMarker.position.set(dx * c - dz * s, this.eruptTarget.y - this.position.y + 0.06, dx * s + dz * c)
      p.eruptMaterial.opacity = stage === 'active' ? 1 : 0.3 + 0.55 * k * (0.75 + 0.25 * Math.sin(t * 20))
    }

    // Phase 2 spore aura
    p.aura.visible = free > 0.05
    p.auraMaterial.opacity = (0.05 + 0.025 * Math.sin(t * 2.6)) * free
  }

  /** Death: the body sags into the altar, the cap tips, the glow dies out. */
  protected updateDeathAnimation(_deltaTime: number, t: number): void {
    const mesh = this.getMesh()
    const p = this.parts
    if (!mesh || !p) return
    p.slamMarker.visible = false
    p.eruptMarker.visible = false
    p.aura.visible = false
    mesh.position.y = this.position.y - easeOut(t) * 1.6
    p.body.rotation.x = 0.35 * easeOut(Math.min(1, t * 1.5))
    p.cap.rotation.z = 0.5 * easeOut(t)
    p.cap.position.y = 3.2 - 0.6 * t
    for (const arm of p.arms) arm.rotation.x = 0.6 * easeOut(t)
    p.glow.color.setHex(TEAL).multiplyScalar(Math.max(0, 1 - t))
    p.eyeGlow.color.setHex(EMBER_EYE).multiplyScalar(Math.max(0, 1 - t * 1.5))
    const shrink = t > 0.7 ? 1 - (t - 0.7) / 0.3 * 0.6 : 1
    mesh.scale.setScalar(shrink)
  }

  dispose(): void {
    this.parts = null
    super.dispose()
  }
}
