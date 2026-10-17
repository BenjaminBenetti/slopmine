import * as THREE from 'three'
import { GuardianEntity, guardianDrop, type GuardianAttack } from '../GuardianEntity.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { ShardlingEntity } from '../../enemies/shardling/ShardlingEntity.ts'
import { PrismFocusEntity } from './PrismFocusEntity.ts'
import {
  buildPrismWardenModel, WARDEN_CORE_Y, WARDEN_CORE_Z, type PrismWardenParts,
} from './PrismWardenModel.ts'

export const PRISM_WARDEN_ID = 'prism_warden'
export const PRISM_WARDEN_NAME = 'The Prism Warden'

// ---- Tuning (DESIGN §7/§8: 350-550 HP, hits 8-14, ~45-90 s in diamond/infernium gear)
const MAX_HEALTH = 520
const SLAM_DAMAGE = 13
const SHARD_DAMAGE = 7
const BEAM_DAMAGE = 14
const NOVA_DAMAGE = 6
/** Damage share that passes the refractive shield while foci live. */
const SHIELD_DAMAGE_SHARE = 0.15
/** Damage multiplier while staggered after the shield shatters (punish window). */
const STAGGER_DAMAGE_BONUS = 1.25
const STAGGER_TIME = 2.6

// Prism beam
const BEAM_RANGE = 30
const BEAM_LOCK_AT = 0.62 // windup progress where the aim locks (telegraph turns solid)
const BEAM_TRACK_SPEED = 2.2 // rad/s while tracking
const BEAM_HIT_RADIUS = 0.95
const BEAM_WINDUP = 1.5
const BEAM_DURATION = 0.5

const PLAYER_CHEST = 1.1

/**
 * The Prism Warden - guardian of the Prism Sanctum (Crystal Abyss), guardian
 * index 4. A crystal colossus with a prism heart.
 *
 * Attacks (each telegraphed):
 * - Crystal Slam: raises both crystal fists overhead, then smashes the floor
 *   in front of it (shockwave ring, close range).
 * - Shard Volley: the crystal crown on its back flares, then a fan of crystal
 *   shards (two waves from phase 1).
 * - Prism Beam: a thin, flickering aim line tracks the player from its
 *   heart, then LOCKS (turns solid and bright); a beat later a thick beam of
 *   light fires along the line. Sidestep after the lock.
 * - Prism Nova (phase 2): crouches and bursts a ring of shards.
 * - Summon Shardlings (shield phases): calls two shardlings out of the floor.
 *
 * Refractive shield: at 66 % and 33 % health it roars and raises a faceted
 * shield held up by orbiting prism foci (3, then 4). While any focus lives,
 * only 15 % of the damage gets through. Breaking the last focus shatters the
 * shield and staggers the Warden (kneels 2.6 s, takes +25 % damage).
 *
 * Drops (into the reward chest): 2 prism sigils, Infernal Heart, prism shards,
 * diamonds, infernium.
 */
export class PrismWardenEntity extends GuardianEntity {
  private parts: PrismWardenParts | null = null
  private time = 0

  // Refractive shield
  private foci: PrismFocusEntity[] = []
  private shieldBrokenPhase = 0
  private shieldMesh: THREE.Group | null = null
  private shieldMaterials: THREE.MeshBasicMaterial[] = []
  private shieldFlash = 0
  private staggerTimer = 0
  private wasShielded = false

  // Prism beam
  private beamGroup: THREE.Group | null = null
  private beamCore: THREE.Mesh | null = null
  private beamGlow: THREE.Mesh | null = null
  private beamCoreMaterial: THREE.MeshBasicMaterial | null = null
  private beamGlowMaterial: THREE.MeshBasicMaterial | null = null
  private readonly beamDir = new THREE.Vector3(0, 0, 1)
  private beamLength = BEAM_RANGE
  private beamHit = false

  // Slam shockwave
  private shockwave: THREE.Mesh | null = null
  private shockwaveMaterial: THREE.MeshBasicMaterial | null = null
  private shockwaveTimer = -1

  private volleySecondWave = false

  private readonly tmpOrigin = new THREE.Vector3()
  private readonly tmpTarget = new THREE.Vector3()
  private readonly tmpDir = new THREE.Vector3()

  constructor(position: THREE.Vector3) {
    super({
      position,
      guardianId: PRISM_WARDEN_ID,
      displayName: PRISM_WARDEN_NAME,
      maxHealth: MAX_HEALTH,
      hitboxSize: new THREE.Vector3(2.4, 4.0, 2.0),
      chaseSpeed: 2.6,
      walkSpeed: 1.6,
      attackRange: 3.4,
      attackDamage: SLAM_DAMAGE,
      attackCooldown: 0.8,
      attackKnockbackHorizontal: 9,
      attackKnockbackVertical: 6,
      arenaRadius: 13,
      arenaHeight: 10,
      phaseThresholds: [0.66, 0.33],
      phaseTransitionTime: 1.6,
      knockbackResistance: 0.95,
      turnSpeed: 2.6,
      maxMinions: 10,
      bossBarColor: '#a24cf0',
      deathDuration: 3,
      projectileOrigin: new THREE.Vector3(0, 3.35, 0.4),
      drops: [
        guardianDrop('prism_sigil', 2), // DESIGN2 §1: two sigils per castle
        guardianDrop('infernal_heart'),
        guardianDrop('prism_shard', 6, 10),
        guardianDrop('diamond', 2, 3),
        guardianDrop('infernium_ingot', 1, 2),
      ],
    })
  }

  // ===========================================================================
  // Model
  // ===========================================================================

  protected createMesh(): THREE.Object3D {
    const parts = buildPrismWardenModel()
    this.parts = parts
    for (const material of parts.litMaterials) this.registerMaterialForLighting(material)

    optimizeEntityMesh(parts.root, {
      merge: true,
      dynamic: [
        parts.root, parts.torso, parts.head, parts.leftArm, parts.rightArm,
        parts.leftLeg, parts.rightLeg, parts.core, parts.backCrystals,
      ],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    this.buildBeam(parts.root)
    this.buildShield(parts.root)
    this.buildShockwave(parts.root)
    return parts.root
  }

  private buildBeam(root: THREE.Group): void {
    const group = new THREE.Group()
    group.position.set(0, WARDEN_CORE_Y, WARDEN_CORE_Z)
    this.beamCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2e2ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.beamGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xb050ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
    this.beamCore = new THREE.Mesh(geometry, this.beamCoreMaterial)
    this.beamGlow = new THREE.Mesh(geometry.clone(), this.beamGlowMaterial)
    group.add(this.beamCore)
    group.add(this.beamGlow)
    group.visible = false
    root.add(group)
    this.beamGroup = group
  }

  private buildShield(root: THREE.Group): void {
    const group = new THREE.Group()
    group.position.y = 2.1
    const fill = new THREE.MeshBasicMaterial({
      color: 0x9a5cff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const edges = new THREE.MeshBasicMaterial({
      color: 0xe0b8ff, transparent: true, opacity: 0.4, depthWrite: false, wireframe: true,
    })
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.55, 1), fill))
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), edges))
    group.visible = false
    root.add(group)
    this.shieldMesh = group
    this.shieldMaterials = [fill, edges]
  }

  private buildShockwave(root: THREE.Group): void {
    this.shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: 0xc890ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2), this.shockwaveMaterial)
    ring.position.set(0, 0.08, 1.4)
    ring.visible = false
    root.add(ring)
    this.shockwave = ring
  }

  // ===========================================================================
  // Attacks
  // ===========================================================================

  protected defineAttacks(): GuardianAttack[] {
    return [
      {
        id: 'slam',
        cooldown: 4.5,
        windup: 0.95,
        recovery: 0.75,
        maxRange: 4.4,
        weight: 2,
        execute: () => {
          const center = this.frontPoint(1.4)
          this.areaStrike(center, 3.8, SLAM_DAMAGE, { knockback: 10, knockbackUp: 6 })
          this.shockwaveTimer = 0
        },
      },
      {
        id: 'volley',
        cooldown: 5.5,
        initialCooldown: 1.5,
        windup: 0.85,
        minRange: 2.5,
        maxRange: 26,
        phases: [0],
        requiresLineOfSight: true,
        execute: () => {
          this.spawnProjectileFan(5, 0.9, { preset: 'crystal_shard', speed: 15, damage: SHARD_DAMAGE, scale: 1.4 })
        },
      },
      {
        id: 'volley_twin',
        cooldown: 5,
        windup: 0.75,
        duration: 0.5,
        minRange: 2.5,
        maxRange: 26,
        phases: [1, 2],
        requiresLineOfSight: true,
        execute: () => {
          this.volleySecondWave = false
          this.spawnProjectileFan(7, 1.1, { preset: 'crystal_shard', speed: 15, damage: SHARD_DAMAGE, scale: 1.4 })
        },
        update: (_dt, elapsed) => {
          if (this.volleySecondWave || elapsed < 0.35) return
          this.volleySecondWave = true
          this.spawnProjectileFan(6, 1.0, { preset: 'crystal_shard', speed: 13, damage: SHARD_DAMAGE, scale: 1.4 })
        },
      },
      {
        id: 'beam',
        cooldown: 8,
        initialCooldown: 3,
        windup: BEAM_WINDUP,
        duration: BEAM_DURATION,
        recovery: 0.8,
        minRange: 2.5,
        maxRange: 28,
        weight: 1.5,
        requiresLineOfSight: true,
        trackDuringWindup: false,
        onStart: () => {
          this.beamHit = false
          this.aimBeamAt(1, true)
        },
        execute: () => {
          this.beamHit = false
          this.checkBeamHit()
        },
        update: () => {
          this.checkBeamHit()
        },
      },
      {
        id: 'summon',
        cooldown: 14,
        initialCooldown: 2,
        windup: 1.1,
        recovery: 0.6,
        maxRange: 40,
        phases: [1, 2],
        canUse: () => this.isShielded() && this.countShardlings() < 2,
        execute: () => {
          for (const side of [-1, 1]) {
            const spot = this.frontPoint(1.0, side * 2.8)
            spot.y += 0.6
            this.spawnMinion(new ShardlingEntity({ position: spot }))
          }
          this.shockwaveTimer = 0
        },
      },
      {
        id: 'nova',
        cooldown: 9,
        initialCooldown: 2,
        windup: 1.0,
        recovery: 0.6,
        maxRange: 30,
        phases: [2],
        execute: () => {
          const from = this.position.clone()
          from.y += 1.4
          this.spawnProjectileRing(12, { preset: 'crystal_shard', speed: 10, damage: NOVA_DAMAGE, scale: 1.2, from })
        },
      },
    ]
  }

  /** World point `forward` blocks ahead of the Warden (and `side` to its right), at its feet. */
  private frontPoint(forward: number, side = 0): THREE.Vector3 {
    const sin = Math.sin(this.facing)
    const cos = Math.cos(this.facing)
    return new THREE.Vector3(
      this.position.x + sin * forward + cos * side,
      this.position.y,
      this.position.z + cos * forward - sin * side
    )
  }

  // ===========================================================================
  // Prism beam
  // ===========================================================================

  /** World position of the prism heart (beam origin) for the current facing. */
  private beamOrigin(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.position.x + Math.sin(this.facing) * WARDEN_CORE_Z,
      this.position.y + WARDEN_CORE_Y,
      this.position.z + Math.cos(this.facing) * WARDEN_CORE_Z
    )
  }

  /**
   * Turn the beam toward the player's chest (at most `maxTurn` radians, or
   * instantly with `snap`), face along it, and measure its length to the
   * first solid block.
   */
  private aimBeamAt(maxTurn: number, snap = false): void {
    const player = this.playerPosition
    if (player) {
      const origin = this.beamOrigin(this.tmpOrigin)
      const desired = this.tmpDir.set(player.x, player.y + PLAYER_CHEST, player.z).sub(origin)
      if (desired.lengthSq() > 1e-4) {
        desired.normalize()
        if (snap) {
          this.beamDir.copy(desired)
        } else {
          const angle = this.beamDir.angleTo(desired)
          if (angle > 1e-4) {
            const t = Math.min(1, maxTurn / angle)
            this.beamDir.lerp(desired, t).normalize()
          }
        }
      }
    }
    this.facing = Math.atan2(this.beamDir.x, this.beamDir.z)
    // Length: march to the first solid block
    const origin = this.beamOrigin(this.tmpOrigin)
    let length = BEAM_RANGE
    for (let d = 1; d <= BEAM_RANGE; d += 0.25) {
      if (this.isSolidAt(origin.x + this.beamDir.x * d, origin.y + this.beamDir.y * d, origin.z + this.beamDir.z * d)) {
        length = d
        break
      }
    }
    this.beamLength = length
  }

  /** One hit per beam: the player's body within BEAM_HIT_RADIUS of the beam segment. */
  private checkBeamHit(): void {
    if (this.beamHit) return
    const player = this.playerPosition
    if (!player) return
    const origin = this.beamOrigin(this.tmpOrigin)
    for (const h of [0.3, 1.0, 1.6]) {
      const p = this.tmpTarget.set(player.x, player.y + h, player.z).sub(origin)
      const along = THREE.MathUtils.clamp(p.dot(this.beamDir), 0, this.beamLength)
      const dx = p.x - this.beamDir.x * along
      const dy = p.y - this.beamDir.y * along
      const dz = p.z - this.beamDir.z * along
      if (dx * dx + dy * dy + dz * dz <= BEAM_HIT_RADIUS * BEAM_HIT_RADIUS) {
        this.beamHit = true
        this.damagePlayer(BEAM_DAMAGE, 7, 'projectile', 3)
        return
      }
    }
  }

  private updateBeamVisual(): void {
    const group = this.beamGroup
    if (!group || !this.beamCore || !this.beamGlow || !this.beamCoreMaterial || !this.beamGlowMaterial) return
    const stage = this.activeAttackId === 'beam' ? this.attackStage : null
    if (stage !== 'windup' && stage !== 'active') {
      group.visible = false
      return
    }
    group.visible = true
    // Local pitch only: the Warden faces along the beam's yaw
    const pitch = Math.asin(THREE.MathUtils.clamp(this.beamDir.y, -1, 1))
    group.rotation.set(-pitch, 0, 0)
    const length = this.beamLength
    if (stage === 'windup') {
      const locked = this.attackStageProgress >= BEAM_LOCK_AT
      const width = locked ? 0.13 : 0.07
      this.beamCore.scale.set(width, width, length)
      this.beamGlow.scale.set(width * 3, width * 3, length)
      this.beamCoreMaterial.opacity = locked
        ? 0.75 + 0.25 * Math.sin(this.time * 40)
        : 0.3 + 0.25 * Math.sin(this.time * 12)
      this.beamGlowMaterial.opacity = locked ? 0.25 : 0.08
    } else {
      const fade = 1 - Math.min(1, this.attackStageProgress)
      const width = 0.55 + 0.1 * Math.sin(this.time * 50)
      this.beamCore.scale.set(width, width, length)
      this.beamGlow.scale.set(width * 2.4, width * 2.4, length)
      this.beamCoreMaterial.opacity = 0.95 * (0.4 + 0.6 * fade)
      this.beamGlowMaterial.opacity = 0.55 * (0.4 + 0.6 * fade)
    }
  }

  // ===========================================================================
  // Refractive shield
  // ===========================================================================

  private isShielded(): boolean {
    for (const focus of this.foci) if (focus.isActive) return true
    return false
  }

  private countShardlings(): number {
    // Minions are foci and shardlings; foci are tracked separately
    let foci = 0
    for (const focus of this.foci) if (focus.isAlive) foci++
    return Math.max(0, this.minionCount - foci)
  }

  private raiseShield(count: number): void {
    this.foci = []
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count
      const height = 1.4 + (i % 2) * 1.3
      const focus = new PrismFocusEntity(this.position.clone(), this, angle, 3.7, height, 0.55)
      if (this.spawnMinion(focus)) this.foci.push(focus)
    }
    this.wasShielded = this.foci.length > 0
  }

  protected onPhaseChanged(phase: number): void {
    this.raiseShield(phase >= 2 ? 4 : 3)
  }

  protected onEngage(): void {
    // A fight resumed mid-way (the player left and came back before the
    // Warden fully healed) raises the shield of the current phase again
    if (this.phase > this.shieldBrokenPhase && !this.isShielded()) {
      this.raiseShield(this.phase >= 2 ? 4 : 3)
    }
  }

  protected onDisengage(): void {
    this.foci = []
    this.wasShielded = false
    this.staggerTimer = 0
  }

  protected onReset(): void {
    this.shieldBrokenPhase = 0
  }

  /** Player hits: the shield turns most of the damage aside; a staggered Warden takes extra. */
  applyDamage(amount: number, from?: THREE.Vector3): boolean {
    let scaled = amount
    if (this.isShielded()) {
      scaled = amount * SHIELD_DAMAGE_SHARE
      this.shieldFlash = 1
    } else if (this.staggerTimer > 0) {
      scaled = amount * STAGGER_DAMAGE_BONUS
    }
    return super.applyDamage(scaled, from)
  }

  protected updateCombat(deltaTime: number): void {
    const shielded = this.isShielded()
    if (this.wasShielded && !shielded) {
      // Last focus broken: the shield shatters and the Warden kneels
      this.wasShielded = false
      this.shieldBrokenPhase = this.phase
      this.foci = []
      this.cancelAttack()
      this.staggerTimer = STAGGER_TIME
      this.shieldFlash = 1
    }
    if (this.staggerTimer > 0) {
      this.staggerTimer = Math.max(0, this.staggerTimer - deltaTime)
      this.stopMoving()
      return
    }
    super.updateCombat(deltaTime)
  }

  private updateShieldVisual(deltaTime: number): void {
    const mesh = this.shieldMesh
    if (!mesh) return
    const shielded = this.isShielded()
    this.shieldFlash = Math.max(0, this.shieldFlash - deltaTime * 3)
    mesh.visible = shielded || this.shieldFlash > 0.05
    if (!mesh.visible) return
    mesh.rotation.y += deltaTime * 0.4
    mesh.rotation.x = Math.sin(this.time * 0.5) * 0.2
    const shatter = shielded ? 1 : 1 + (1 - this.shieldFlash) * 0.6
    mesh.scale.setScalar(shatter * (1 + 0.03 * Math.sin(this.time * 3)))
    const [fill, edges] = this.shieldMaterials
    if (fill) fill.opacity = (shielded ? 0.1 : 0) + this.shieldFlash * 0.25
    if (edges) edges.opacity = (shielded ? 0.32 + 0.1 * Math.sin(this.time * 5) : 0) + this.shieldFlash * 0.5
  }

  // ===========================================================================
  // Animation
  // ===========================================================================

  protected updateAnimations(deltaTime: number): void {
    this.time += deltaTime
    const p = this.parts
    if (!p) return

    // Beam aim (the scheduler does not turn the Warden during the beam windup)
    if (this.activeAttackId === 'beam' && this.attackStage === 'windup') {
      if (this.attackStageProgress < BEAM_LOCK_AT) this.aimBeamAt(BEAM_TRACK_SPEED * deltaTime)
      else this.aimBeamAt(0)
    }
    this.updateBeamVisual()
    this.updateShieldVisual(deltaTime)
    this.updateShockwave(deltaTime)

    // Neutral pose, then layer the current action on top
    let torsoPitch = Math.sin(this.time * 1.6) * 0.03
    let torsoDrop = 0
    let armL = 0
    let armR = 0
    let armSpread = 0
    let headPitch = 0
    let legL = 0
    let legR = 0
    let coreGlow = 0
    let crownGlow = 0

    if (this.isWalking) {
      const swing = Math.sin(this.time * 4.2) * 0.38
      legL = swing
      legR = -swing
      armL = -swing * 0.6
      armR = swing * 0.6
    }

    const stage = this.attackStage
    const k = this.attackStageProgress
    const ease = (t: number): number => 1 - (1 - t) * (1 - t)
    switch (this.activeAttackId) {
      case 'slam':
        if (stage === 'windup') {
          armL = armR = -2.9 * ease(k)
          torsoPitch = -0.3 * k
          headPitch = -0.2 * k
        } else {
          const t = stage === 'active' ? 0 : k
          armL = armR = 0.55 * (1 - t)
          torsoPitch = 0.45 * (1 - t)
        }
        break
      case 'volley':
      case 'volley_twin':
        if (stage === 'windup') {
          crownGlow = 3 * k
          torsoPitch = -0.25 * k
          armSpread = 0.5 * k
        } else {
          crownGlow = 3 * (1 - k)
          torsoPitch = 0.12 * (1 - k)
        }
        break
      case 'beam':
        if (stage === 'windup') {
          coreGlow = k < BEAM_LOCK_AT ? 1.2 * k : 2 + Math.sin(this.time * 40) * 0.5
          armSpread = 0.8 * ease(k)
          torsoPitch = 0.1 * k
        } else if (stage === 'active') {
          coreGlow = 3
          armSpread = 0.8
          torsoPitch = -0.08
        } else {
          armSpread = 0.8 * (1 - k)
        }
        break
      case 'summon':
        if (stage === 'windup') {
          armL = armR = -3.0 * ease(k)
          headPitch = -0.4 * k
          coreGlow = k
        } else {
          armL = armR = 0.6 * (1 - k)
          torsoPitch = 0.5 * (1 - k)
        }
        break
      case 'nova':
        if (stage === 'windup') {
          torsoDrop = 0.5 * ease(k)
          torsoPitch = 0.5 * k
          armSpread = -0.2 * k
          coreGlow = 2 * k
          crownGlow = 2 * k
        } else {
          torsoPitch = -0.25 * (1 - k)
          armSpread = 1.2 * (1 - k)
          coreGlow = 2 * (1 - k)
        }
        break
    }

    if (this.isTransitioning) {
      // Roar: arms flung wide, head back, heart blazing
      armSpread = 1.3
      armL = armR = -0.6
      headPitch = -0.5
      torsoPitch = -0.2
      coreGlow = 2.5
    }
    if (this.staggerTimer > 0) {
      // Kneeling, heart dimmed
      torsoDrop = 0.6
      torsoPitch = 0.65
      armL = armR = 0.35
      headPitch = 0.3
      coreGlow = -0.6
    }

    p.torso.rotation.x = torsoPitch
    p.torso.position.y = 1.7 - torsoDrop
    p.leftArm.rotation.x = armL
    p.rightArm.rotation.x = armR
    p.leftArm.rotation.z = -armSpread
    p.rightArm.rotation.z = armSpread
    p.head.rotation.x = headPitch
    p.leftLeg.rotation.x = legL
    p.rightLeg.rotation.x = legR

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4)
    p.core.scale.set(1 + coreGlow * 0.15, 1.3 * (1 + coreGlow * 0.15), 0.7)
    p.core.rotation.y += deltaTime * (1 + coreGlow)
    const coreLight = THREE.MathUtils.clamp(0.75 + 0.15 * pulse + coreGlow * 0.12, 0.3, 1.2)
    p.coreMaterial.color.setRGB(0.91 * coreLight, 0.82 * coreLight, coreLight)
    p.backCrystalMaterial.emissiveIntensity = 0.55 + 0.1 * pulse + crownGlow
    p.crystalMaterial.emissiveIntensity = 0.45 + 0.1 * pulse + (this.isShielded() ? 0.25 : 0)
  }

  private updateShockwave(deltaTime: number): void {
    const ring = this.shockwave
    const material = this.shockwaveMaterial
    if (!ring || !material) return
    if (this.shockwaveTimer < 0) {
      ring.visible = false
      return
    }
    this.shockwaveTimer += deltaTime
    const t = this.shockwaveTimer / 0.5
    if (t >= 1) {
      this.shockwaveTimer = -1
      ring.visible = false
      return
    }
    ring.visible = true
    ring.scale.setScalar(0.5 + t * 3.6)
    material.opacity = 0.8 * (1 - t)
  }

  /** Crumble: the colossus sinks and shrinks, its heart flaring out. */
  protected updateDeathAnimation(deltaTime: number, t: number): void {
    const mesh = this.getMesh()
    const p = this.parts
    if (!mesh || !p) return
    this.time += deltaTime
    if (this.beamGroup) this.beamGroup.visible = false
    if (this.shieldMesh) this.shieldMesh.visible = false
    p.torso.rotation.x = 0.5 * Math.min(1, t * 3)
    p.leftArm.rotation.x = p.rightArm.rotation.x = 0.4
    const shrink = Math.max(0.02, 1 - Math.max(0, t - 0.35) / 0.65)
    mesh.scale.set(1 + (1 - shrink) * 0.3, shrink, 1 + (1 - shrink) * 0.3)
    mesh.position.y = this.position.y - (1 - shrink) * 0.4
    const flare = t < 0.4 ? 1 + t * 4 : Math.max(0, 2.6 * (1 - t))
    p.coreMaterial.color.setRGB(0.9 * flare, 0.8 * flare, flare)
    p.crystalMaterial.emissiveIntensity = 0.5 + flare
  }

  dispose(): void {
    this.parts = null
    this.foci = []
    this.beamGroup = null
    this.beamCore = null
    this.beamGlow = null
    this.beamCoreMaterial = null
    this.beamGlowMaterial = null
    this.shieldMesh = null
    this.shieldMaterials = []
    this.shockwave = null
    this.shockwaveMaterial = null
    super.dispose()
  }
}
