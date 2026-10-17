import * as THREE from 'three'
import { GuardianEntity, guardianDrop, type GuardianAttack } from '../GuardianEntity.ts'
import type { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { MagmaSlimeEntity } from '../../animals/magma_slime/MagmaSlimeEntity.ts'
import { FirePatchEntity, type FirePatchOptions } from './FirePatchEntity.ts'
import { buildPyreTyrantModel, type PyreTyrantModel } from './PyreTyrantModel.ts'

/** Guardian id (`guardian-defeated.guardianId`, DESIGN §11). */
export const PYRE_TYRANT_ID = 'pyre_tyrant'
/** Spawner metadata index (DESIGN §7: molten = 1). */
export const PYRE_TYRANT_INDEX = 1

const MAX_HEALTH = 550
/** Covers the Throne Crucible (the bastion's 27×27 boss arena; its lava basins sit at ±7). */
const ARENA_RADIUS = 13

// Attack tuning (raw damage, before armour / potions)
const CLEAVE_DAMAGE = 11
const STOMP_DAMAGE = 7
const STOMP_RADIUS = 3
const FIREBALL_DAMAGE = 9
const VOLLEY_DAMAGE = 8
const SLAM_DAMAGE = 13
const SLAM_RADIUS = 5
const ERUPTION_DAMAGE = 10
const NOVA_DAMAGE = 7
/** Burning ground: fire damage per tick (armour does not stop it, fire resistance does). */
const BURN_DAMAGE = 3

/** Most fire patches alive at once (fireball scorches give way first). */
const MAX_PATCHES = 14
/** Most summoned magma slimes alive at once. */
const MAX_SLIMES = 3

/** Phase 2 (below half health): faster, every fireball scorches the floor. */
const ENRAGED_SPEED_MULTIPLIER = 1.3

const FIST_COLOR = new THREE.Color(0xff8a28)
const FIST_HOT = new THREE.Color(0xfff2b0)
const GLOW_BASE = [new THREE.Color(0xff6a1a), new THREE.Color(0xffc040), new THREE.Color(0xffe680)]
const GLOW_ENRAGED = [new THREE.Color(0xffa040), new THREE.Color(0xfff0a0), new THREE.Color(0xffffff)]

/**
 * The Pyre Tyrant - guardian of the Infernal Bastion (Molten Wastes).
 *
 * A slow, heavy forge-king that punishes standing still and standing far:
 * - cleave: a wide overhead magma-fist swing up close (raised fist telegraph)
 * - stomp: point-blank, a raised leg stamps down and hurls the player back
 * - fireball: a single heavy fireball at range (fist thrust forward, flaring)
 * - volley: a fan of fireballs, 3 then 5 (both fists raised, crown flaring)
 * - slam: leaps its fists down; a ring on the ground marks the blast radius,
 *   and the floor around it burns for a while after
 * - phase 2 (< 50 %): it roars (fire nova, 2 s invulnerable), moves faster,
 *   its fireballs scorch the floor, it calls lava eruptions under the player
 *   (pulsing warning rings first) and summons magma slimes from the lava
 *   basins of its arena
 * Drops the Ember Sigil, an Infernal Heart, infernium ingots, magma cream
 * and diamonds, spilled on the arena floor.
 */
export class PyreTyrantEntity extends GuardianEntity {
  private model: PyreTyrantModel | null = null
  private readonly patches = new Set<FirePatchEntity>()
  private readonly slimes = new Set<MagmaSlimeEntity>()

  // Animation state
  private walkPhase = 0
  private flamePhase = Math.random() * 10
  private roarTime = 0
  private enrageBlend = 0

  private readonly scratch = new THREE.Vector3()

  constructor(position: THREE.Vector3) {
    super({
      position,
      guardianId: PYRE_TYRANT_ID,
      displayName: 'The Pyre Tyrant',
      maxHealth: MAX_HEALTH,
      hitboxSize: new THREE.Vector3(1.8, 3.4, 1.6),
      walkSpeed: 2.0,
      chaseSpeed: 3.2,
      jumpVelocity: 9.5,
      attackRange: 3.8,
      attackDamage: CLEAVE_DAMAGE,
      attackCooldown: 0.65,
      attackKnockbackHorizontal: 7,
      attackKnockbackVertical: 4,
      phaseThresholds: [0.5],
      phaseTransitionTime: 2.0,
      arenaRadius: ARENA_RADIUS,
      arenaHeight: 10,
      knockbackResistance: 0.95,
      // Molten-rock hide: blunts every blow (with 550 HP, ~650 effective)
      damageTakenMultiplier: 0.85,
      preferredRange: 2.8,
      turnSpeed: 3.5,
      maxMinions: MAX_PATCHES + MAX_SLIMES + 8,
      bossBarColor: '#e0521c',
      deathDuration: 3.0,
      projectileOrigin: new THREE.Vector3(0, 2.7, 1.0),
      drops: [
        guardianDrop('ember_sigil', 2, 2), // two per castle (DESIGN2 sigil economy)
        guardianDrop('infernal_heart'),
        guardianDrop('infernium_ingot', 2, 4),
        guardianDrop('magma_cream', 3, 5),
        guardianDrop('diamond', 1, 3),
      ],
    })
  }

  // ===========================================================================
  // Model
  // ===========================================================================

  protected createMesh(): THREE.Object3D {
    const model = buildPyreTyrantModel()
    this.model = model
    for (const material of model.litMaterials) this.registerMaterialForLighting(material)
    optimizeEntityMesh(model.root, {
      merge: true,
      dynamic: [
        model.upper, model.head, model.leftArm, model.rightArm, model.leftLeg, model.rightLeg,
        model.crown, ...model.crownFlames, model.leftFist, model.rightFist, model.slamRing,
      ],
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
        id: 'cleave',
        cooldown: 2.0,
        windup: 0.7,
        recovery: 0.6,
        maxRange: 3.9,
        weight: 2,
        execute: () => {
          this.meleeStrike({ damage: CLEAVE_DAMAGE, reach: 4.3, knockback: 7, knockbackUp: 4, arc: Math.PI * 0.9 })
        },
      },
      {
        // Point-blank: a stamp that throws the player back into fireball range
        id: 'stomp',
        cooldown: 5,
        initialCooldown: 3,
        windup: 0.55,
        recovery: 0.5,
        maxRange: 2.8,
        execute: () => {
          const ground = this.groundY(this.position.x, this.position.z, this.position.y)
          this.areaStrike(this.scratch.set(this.position.x, ground, this.position.z), STOMP_RADIUS, STOMP_DAMAGE, {
            knockback: 12,
            knockbackUp: 5,
            height: 2.5,
          })
        },
      },
      {
        id: 'fireball',
        cooldown: 3.0,
        initialCooldown: 1.2,
        windup: 0.65,
        recovery: 0.5,
        minRange: 3.5,
        maxRange: 26,
        weight: 2,
        requiresLineOfSight: true,
        execute: () => {
          this.spawnProjectile({
            preset: 'fireball',
            speed: 15,
            damage: FIREBALL_DAMAGE,
            scale: 1.35,
            knockback: 4,
            onHitBlock: (p) => this.scorch(p),
          })
        },
      },
      {
        id: 'volley',
        cooldown: 7,
        initialCooldown: 4,
        windup: 1.1,
        recovery: 0.8,
        maxRange: 26,
        requiresLineOfSight: true,
        execute: () => {
          const enraged = this.phase >= 1
          this.spawnProjectileFan(enraged ? 5 : 3, enraged ? 0.95 : 0.55, {
            preset: 'fireball',
            speed: 13,
            damage: VOLLEY_DAMAGE,
            scale: 1.1,
            knockback: 3,
            onHitBlock: (p) => this.scorch(p),
          })
        },
      },
      {
        id: 'slam',
        cooldown: 9,
        initialCooldown: 5,
        windup: 1.3,
        recovery: 1.0,
        maxRange: SLAM_RADIUS + 0.5,
        weight: 1.5,
        execute: () => {
          const ground = this.groundY(this.position.x, this.position.z, this.position.y)
          this.areaStrike(this.scratch.set(this.position.x, ground, this.position.z), SLAM_RADIUS, SLAM_DAMAGE, {
            knockback: 9,
            knockbackUp: 6,
            height: 3,
          })
          // The floor around the impact burns
          const enraged = this.phase >= 1
          const count = enraged ? 6 : 4
          const start = Math.random() * Math.PI * 2
          for (let i = 0; i < count; i++) {
            const angle = start + (i / count) * Math.PI * 2
            const dist = 2.5 + Math.random() * 2.5
            this.spawnPatch({
              position: new THREE.Vector3(this.position.x + Math.sin(angle) * dist, 0, this.position.z + Math.cos(angle) * dist),
              radius: 1.4,
              burnTime: enraged ? 8 : 6,
              burnDamage: BURN_DAMAGE,
            })
          }
        },
      },
      {
        id: 'eruption',
        phases: [1],
        cooldown: 10,
        initialCooldown: 2.5,
        windup: 0.9,
        recovery: 0.7,
        maxRange: 30,
        execute: () => {
          const player = this.playerPosition
          if (!player) return
          // One under the player, the rest around them
          const spots = 3 + Math.floor(Math.random() * 2)
          for (let i = 0; i < spots; i++) {
            const angle = Math.random() * Math.PI * 2
            const dist = i === 0 ? 0 : 2.5 + Math.random() * 2.5
            const point = this.clampToArena(
              new THREE.Vector3(player.x + Math.sin(angle) * dist, player.y, player.z + Math.cos(angle) * dist),
              1.5
            )
            this.spawnPatch({
              position: point,
              radius: 1.8,
              warnTime: 1.3 + i * 0.25,
              eruptDamage: ERUPTION_DAMAGE,
              burnTime: 4,
              burnDamage: BURN_DAMAGE,
            }, player.y)
          }
        },
      },
      {
        id: 'summon',
        phases: [1],
        cooldown: 20,
        initialCooldown: 10,
        windup: 1.6,
        recovery: 0.6,
        maxRange: 40,
        canUse: () => this.liveSlimes() < MAX_SLIMES,
        onStart: () => {
          this.roarTime = 1.6
        },
        execute: () => {
          this.summonSlimes(2)
        },
      },
    ]
  }

  protected onPhaseChanged(phase: number): void {
    if (phase < 1) return
    // Enrage: a roar, a nova of fire and the first slimes from the lava
    this.roarTime = 2.0
    this.spawnProjectileRing(10, { preset: 'fireball', speed: 10, damage: NOVA_DAMAGE, scale: 1.1, lifetime: 2.5 })
    this.summonSlimes(2)
  }

  protected onReset(): void {
    this.enrageBlend = 0
  }

  protected onDefeated(): void {
    // The tyrant's fire gutters out in a last flare (harmless)
    this.spawnPatch({ position: this.position.clone(), radius: 2.4, burnTime: 2.5, burnDamage: 0 })
  }

  /** Between attacks: close in (faster when enraged), never leaving the arena. */
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
  // Helpers
  // ===========================================================================

  /** Top of the solid ground under (x, z), searched down from near `fromY`. */
  private groundY(x: number, z: number, fromY: number): number {
    const top = Math.floor(fromY) + 2
    for (let y = top; y >= top - 10; y--) {
      if (this.isSolidAt(x, y, z)) return y + 1
    }
    return fromY
  }

  private spawnPatch(options: FirePatchOptions, referenceY = this.position.y): void {
    this.prune()
    if (this.patches.size >= MAX_PATCHES) return
    const position = options.position
    position.y = this.groundY(position.x, position.z, referenceY)
    const patch = new FirePatchEntity({ ...options, position })
    if (this.spawnMinion(patch)) this.patches.add(patch)
  }

  /** Enraged fireballs leave a small burning scorch where they land. */
  private scorch(projectile: ProjectileEntity): void {
    if (this.phase < 1 || this.isDefeated) return
    this.prune()
    if (this.patches.size >= MAX_PATCHES - 4) return
    this.spawnPatch(
      { position: projectile.position.clone(), radius: 1.0, burnTime: 3.5, burnDamage: BURN_DAMAGE - 1 },
      projectile.position.y
    )
  }

  /** Magma slimes crawl out of the arena's corner lava basins (or beside the tyrant). */
  private summonSlimes(count: number): void {
    const corners = [[7, 7], [-7, 7], [7, -7], [-7, -7]]
    const start = Math.floor(Math.random() * 4)
    for (let i = 0; i < count; i++) {
      if (this.liveSlimes() >= MAX_SLIMES) return
      const [cx, cz] = corners[(start + i) % 4]
      let x = this.home.x + cx
      let z = this.home.z + cz
      if (this.isSolidAt(x, this.home.y, z) || this.isSolidAt(x, this.home.y + 1, z)) {
        // Not a bastion arena: crawl out beside the tyrant instead
        x = this.position.x + (i === 0 ? 2 : -2)
        z = this.position.z
      }
      const y = this.groundY(x, z, this.home.y) + 0.3
      const slime = new MagmaSlimeEntity({ position: new THREE.Vector3(x, y, z), variant: 'hell' })
      if (this.spawnMinion(slime)) this.slimes.add(slime)
    }
  }

  private liveSlimes(): number {
    this.prune()
    return this.slimes.size
  }

  private prune(): void {
    for (const patch of this.patches) if (!patch.isAlive) this.patches.delete(patch)
    for (const slime of this.slimes) if (!slime.isAlive || slime.isDying) this.slimes.delete(slime)
  }

  // ===========================================================================
  // Animation
  // ===========================================================================

  protected updateAnimations(deltaTime: number): void {
    const m = this.model
    if (!m) return
    this.flamePhase += deltaTime
    this.roarTime = Math.max(0, this.roarTime - deltaTime)
    const targetEnrage = this.phase >= 1 ? 1 : 0
    this.enrageBlend += (targetEnrage - this.enrageBlend) * Math.min(1, deltaTime * 2)

    // Rest pose
    m.upper.rotation.set(0, 0, 0)
    m.upper.position.y = 1.25
    m.head.rotation.set(0, 0, 0)
    m.leftArm.rotation.set(0, 0, 0.12)
    m.rightArm.rotation.set(0, 0, -0.12)

    // Walk cycle
    if (this.isWalking) {
      this.walkPhase += deltaTime * 6
      const swing = Math.sin(this.walkPhase) * 0.45
      m.leftLeg.rotation.x = swing
      m.rightLeg.rotation.x = -swing
      m.leftArm.rotation.x = -swing * 0.6
      m.rightArm.rotation.x = swing * 0.6
      m.upper.position.y = 1.25 + Math.abs(Math.sin(this.walkPhase)) * 0.06
    } else {
      m.leftLeg.rotation.x *= 0.85
      m.rightLeg.rotation.x *= 0.85
      // Heavy breathing
      m.upper.position.y = 1.25 + Math.sin(this.flamePhase * 1.6) * 0.03
    }

    const attack = this.activeAttackId
    const stage = this.attackStage
    const p = this.attackStageProgress
    let fistHeat = 0
    let crownFlare = 0
    let ringOpacity = 0

    if (attack && stage) {
      const windup = stage === 'windup'
      const strike = stage === 'active' || stage === 'recovery'
      switch (attack) {
        case 'cleave':
          // Right fist raised high behind the head, then swept down across
          if (windup) {
            m.rightArm.rotation.x = -2.6 * p
            m.rightArm.rotation.z = -0.12 - 0.3 * p
            m.upper.rotation.y = 0.35 * p
            fistHeat = p
          } else if (strike) {
            const k = stage === 'active' ? 0 : p
            m.rightArm.rotation.x = -0.4 + 0.4 * k
            m.upper.rotation.y = -0.3 * (1 - k)
            m.upper.rotation.x = 0.25 * (1 - k)
          }
          break
        case 'stomp':
          // A leg raised high, then stamped down
          if (windup) {
            m.leftLeg.rotation.x = -1.1 * p
            m.upper.rotation.x = -0.12 * p
          } else if (stage === 'active' || (stage === 'recovery' && p < 0.4)) {
            m.leftLeg.rotation.x = 0.1
            m.upper.rotation.x = 0.2
          }
          break
        case 'fireball':
          // Right fist thrust forward, flaring
          if (windup) {
            m.rightArm.rotation.x = -1.5 * p
            fistHeat = p
          } else {
            m.rightArm.rotation.x = -1.5 * (1 - p * 0.8)
          }
          break
        case 'volley':
        case 'summon':
          // Both fists raised, crown blazing (summon: a roar, head thrown back)
          if (windup) {
            m.leftArm.rotation.x = -2.8 * p
            m.rightArm.rotation.x = -2.8 * p
            m.leftArm.rotation.z = 0.12 + 0.35 * p
            m.rightArm.rotation.z = -0.12 - 0.35 * p
            crownFlare = p
            fistHeat = p
            if (attack === 'summon') m.head.rotation.x = -0.5 * p
          } else {
            m.leftArm.rotation.x = -2.8 * (1 - p)
            m.rightArm.rotation.x = -2.8 * (1 - p)
          }
          break
        case 'slam':
          // Crouch with both fists overhead; the ring marks the blast; smash
          if (windup) {
            m.leftArm.rotation.x = -3.0 * Math.min(1, p * 1.4)
            m.rightArm.rotation.x = -3.0 * Math.min(1, p * 1.4)
            m.upper.position.y = 1.25 - 0.25 * p
            m.upper.rotation.x = -0.15 * p
            fistHeat = p
            ringOpacity = 0.25 + 0.6 * p * (0.7 + 0.3 * Math.sin(this.flamePhase * 26))
          } else if (stage === 'active' || (stage === 'recovery' && p < 0.5)) {
            m.leftArm.rotation.x = -0.6
            m.rightArm.rotation.x = -0.6
            m.upper.rotation.x = 0.45
            m.upper.position.y = 1.05
            ringOpacity = 0.9 * (1 - p)
          }
          break
        case 'eruption':
          // Arms spread wide, palms up, calling the lava
          if (windup) {
            m.leftArm.rotation.z = 0.12 + 1.3 * p
            m.rightArm.rotation.z = -0.12 - 1.3 * p
            m.head.rotation.x = -0.3 * p
            crownFlare = p
            fistHeat = p * 0.6
          } else {
            m.leftArm.rotation.z = 0.12 + 1.3 * (1 - p)
            m.rightArm.rotation.z = -0.12 - 1.3 * (1 - p)
          }
          break
      }
    }

    // Phase change roar: arms flung wide, head back, shuddering
    if (this.isTransitioning || this.roarTime > 0) {
      const shake = Math.sin(this.flamePhase * 40) * 0.04
      m.leftArm.rotation.z = 1.1 + shake
      m.rightArm.rotation.z = -1.1 - shake
      m.head.rotation.x = -0.55
      m.upper.rotation.x = -0.12 + shake
      crownFlare = 1
      fistHeat = Math.max(fistHeat, 0.7)
    }

    // Slam ring on the ground under the tyrant
    m.slamRing.visible = ringOpacity > 0.01
    if (m.slamRing.visible) {
      m.slamRingMaterial.opacity = Math.min(1, ringOpacity)
      m.slamRing.scale.setScalar(SLAM_RADIUS)
      const ground = this.groundY(this.position.x, this.position.z, this.position.y)
      m.slamRing.position.y = ground - this.position.y + 0.05
    }

    // Fists flare white-hot during windups
    m.fistMaterial.color.copy(FIST_COLOR).lerp(FIST_HOT, Math.min(1, fistHeat))

    // Crown of fire flickers, flares on big moves and in phase 2
    const crownScale = 1 + 0.6 * crownFlare + 0.35 * this.enrageBlend
    m.crown.scale.set(1 + 0.2 * crownFlare, crownScale, 1 + 0.2 * crownFlare)
    for (let i = 0; i < m.crownFlames.length; i++) {
      m.crownFlames[i].scale.y = 0.75 + 0.35 * Math.sin(this.flamePhase * 9 + i * 1.9)
    }

    // Lava seams, heart and eyes run hotter when enraged
    for (let i = 0; i < m.glowMaterials.length; i++) {
      m.glowMaterials[i].color.copy(GLOW_BASE[i]).lerp(GLOW_ENRAGED[i], this.enrageBlend)
    }
  }

  dispose(): void {
    this.patches.clear()
    this.slimes.clear()
    this.model = null
    super.dispose()
  }
}
