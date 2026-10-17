import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import { PrismShardItem } from '../../../items/materials/prism_shard/PrismShardItem.ts'
import { PolishedAbyssalStoneBlockItem } from '../../../items/blocks/polished_abyssal_stone/PolishedAbyssalStoneBlockItem.ts'
import { ABYSSAL_ROCK, ABYSSAL_ROCK_DARK, CRYSTAL_LAVENDER, CRYSTAL_ROSE, CRYSTAL_VIOLET } from '../crystal_shared/crystalPalette.ts'

type SentinelAction = 'dormant' | 'bash' | 'beam' | null

const MAX_HEALTH = 45
const WAKE_TIME = 1.2
/** Damage share of a hit landing on the raised shield (from the front). */
const SHIELD_DAMAGE_SHARE = 0.4
/** Half-angle (cos) of the shield's cover. */
const SHIELD_COVER_COS = 0.45

const BASH_WINDUP = 0.65
const BASH_RECOVERY = 0.55
const BASH_DAMAGE = 7
const BASH_REACH = 2.9

const BEAM_WINDUP = 0.9
const BEAM_LOCK_AT = 0.7
const BEAM_ACTIVE = 0.3
const BEAM_RECOVERY = 0.7
const BEAM_DAMAGE = 9
const BEAM_RANGE = 16
const BEAM_MIN_RANGE = 4
const BEAM_COOLDOWN = 6
const BEAM_HIT_RADIUS = 0.8

const LANCE_Y = 2.1
const STONE_GREY = 0x5c5866

/**
 * Crystal Sentinel - a Prism Sanctum guard: a 3-block armoured crystal
 * statue with a tall crystal tower-shield and a lance. It is placed as a
 * dungeon garrison and spawns DORMANT (stone-grey, still): over 1.2 s it
 * cracks open with violet light (the telegraph that it is about to move),
 * then advances slowly behind its shield.
 *
 * - Frontal hits glance off the shield (40 % damage): flank it, or strike
 *   while it attacks (shield busy).
 * - Shield bash (close): raises the shield 0.65 s, then slams it forward -
 *   7 damage + heavy knockback.
 * - Lance beam (4-16 blocks, line of sight): a thin aim line from the lance
 *   tracks the player, LOCKS (turns bright) at 70 % of a 0.9 s windup, then
 *   fires - 9 damage along the line. Sidestep after the lock.
 *
 * 45 HP. Drops 1-3 prism shards, sometimes polished abyssal stone.
 */
export class CrystalSentinelEntity extends AggressiveEntity {
  readonly type = 'crystal_sentinel'

  private action: SentinelAction = 'dormant'
  private actionStage: 'windup' | 'active' | 'recovery' = 'windup'
  private actionTime = 0
  private beamCooldown = 2
  private beamHit = false
  private bashHit = false
  private time = Math.random() * 10
  private shieldFlash = 0
  /** The player's latest hit struck the tower shield (IEntity; impact sound). */
  lastHitBlocked = false

  private playerRef: THREE.Vector3 | null = null
  private damageFn: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  private readonly beamDir = new THREE.Vector3(0, 0, 1)
  private beamLength = BEAM_RANGE
  private facing = 0

  // Model parts
  private shieldArm: THREE.Group | null = null
  private lanceArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private beam: THREE.Group | null = null
  private beamCoreMaterial: THREE.MeshBasicMaterial | null = null
  private crystalMaterials: THREE.MeshLambertMaterial[] = []
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()

  constructor(config: { position: THREE.Vector3 }) {
    super('crystal_sentinel', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.1, 2.9, 1.1),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: BASH_DAMAGE,
      attackRange: 2.4,
      attackCooldown: 1.6,
      detectionRange: 22,
      chaseSpeed: 2.2,
      walkSpeed: 1.2,
      knockbackHorizontal: 1.5,
      knockbackVertical: 1.0,
      knockbackStunTime: 0.15,
      attackKnockbackHorizontal: 10,
      attackKnockbackVertical: 5,
      drops: [
        { createItem: () => new PrismShardItem(), minCount: 1, maxCount: 3 },
        { createItem: () => new PolishedAbyssalStoneBlockItem(), minCount: 0, maxCount: 2 },
      ],
    })
  }

  // ---- wiring (EntityManager duck typing) ------------------------------------

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageFn = callback
  }

  setWorldQueryFns(
    _blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.solidQuery = solidQuery
  }

  /** Is the sentinel still waking up (a statue)? */
  get isDormant(): boolean {
    return this.action === 'dormant'
  }

  // ---- model -----------------------------------------------------------------

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const rock = new THREE.MeshLambertMaterial({ color: ABYSSAL_ROCK })
    const rockDark = new THREE.MeshLambertMaterial({ color: ABYSSAL_ROCK_DARK })
    const crystal = new THREE.MeshLambertMaterial({ color: CRYSTAL_VIOLET, emissive: new THREE.Color(CRYSTAL_VIOLET), emissiveIntensity: 0 })
    const rose = new THREE.MeshLambertMaterial({ color: CRYSTAL_ROSE, emissive: new THREE.Color(CRYSTAL_ROSE), emissiveIntensity: 0 })
    const shieldMat = new THREE.MeshLambertMaterial({ color: CRYSTAL_LAVENDER, emissive: new THREE.Color(CRYSTAL_VIOLET), emissiveIntensity: 0 })
    this.crystalMaterials = [crystal, rose, shieldMat]
    for (const m of [rock, rockDark, crystal, rose, shieldMat]) this.registerMaterialForLighting(m)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs
    const leg = (side: number): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(side * 0.28, 1.1, 0)
      box(0.36, 1.05, 0.4, rockDark, 0, -0.55, 0, g)
      box(0.42, 0.12, 0.5, rock, 0, -1.04, 0.05, g)
      root.add(g)
      return g
    }
    this.leftLeg = leg(-1)
    this.rightLeg = leg(1)
    // Torso: tapering armoured chest with a crystal core and a crystal-crested helm
    box(0.86, 0.35, 0.55, rockDark, 0, 1.2, 0, root)
    box(1.0, 0.85, 0.62, rock, 0, 1.75, 0, root)
    box(0.3, 0.42, 0.06, crystal, 0, 1.78, 0.33, root)
    box(1.1, 0.16, 0.66, rockDark, 0, 2.22, 0, root) // pauldron bar
    box(0.46, 0.5, 0.46, rock, 0, 2.55, 0.02, root) // helm
    box(0.36, 0.07, 0.04, crystal, 0, 2.58, 0.25, root) // visor slit glow
    const crest = box(0.1, 0.5, 0.36, rose, 0, 2.95, -0.02, root)
    crest.rotation.x = -0.2

    // Shield arm (left): tall crystal tower shield
    const shieldArm = new THREE.Group()
    shieldArm.position.set(-0.62, 2.05, 0.1)
    box(0.24, 0.7, 0.26, rock, 0, -0.32, 0, shieldArm)
    const shield = new THREE.Group()
    shield.position.set(-0.12, -0.55, 0.32)
    box(0.12, 1.5, 0.95, shieldMat, 0, 0, 0, shield)
    box(0.14, 1.56, 0.12, rockDark, 0, 0, 0.47, shield)
    box(0.14, 1.56, 0.12, rockDark, 0, 0, -0.47, shield)
    box(0.16, 0.3, 0.3, rose, 0.02, 0.15, 0, shield) // boss
    shield.rotation.y = Math.PI / 2 // face forward (+Z)
    shieldArm.add(shield)
    root.add(shieldArm)
    this.shieldArm = shieldArm

    // Lance arm (right)
    const lanceArm = new THREE.Group()
    lanceArm.position.set(0.62, 2.05, 0)
    box(0.24, 0.7, 0.26, rock, 0, -0.32, 0, lanceArm)
    const lance = box(0.1, 0.1, 1.9, rockDark, 0, -0.62, 0.55, lanceArm)
    void lance
    box(0.16, 0.16, 0.5, crystal, 0, -0.62, 1.6, lanceArm) // crystal lance tip
    root.add(lanceArm)
    this.lanceArm = lanceArm

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [root, shieldArm, lanceArm, this.leftLeg, this.rightLeg],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // Beam: thin aim line / lance beam from the lance tip (+Z)
    const beam = new THREE.Group()
    beam.position.set(0.62, LANCE_Y - 0.62 + 0.62, 0.3)
    this.beamCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xf0dcff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), this.beamCoreMaterial)
    beam.add(core)
    beam.visible = false
    root.add(beam)
    this.beam = beam

    // Dormant look: stone-grey until awake
    this.applyStoneTint(1)
    return root
  }

  /**
   * 1 = stone statue, 0 = awake colours. Only the crystal parts change: the
   * rock parts are merged into vertex colours and already read as stone.
   */
  private applyStoneTint(k: number): void {
    const grey = new THREE.Color(STONE_GREY)
    const tints: Array<[THREE.MeshLambertMaterial, number]> = [
      [this.crystalMaterials[0], CRYSTAL_VIOLET], [this.crystalMaterials[1], CRYSTAL_ROSE], [this.crystalMaterials[2], CRYSTAL_LAVENDER],
    ]
    for (const [m, base] of tints) {
      if (!m) continue
      m.color.set(base).lerp(grey, k)
    }
  }

  // ---- behaviour -------------------------------------------------------------

  override update(deltaTime: number): void {
    this.time += deltaTime
    this.shieldFlash = Math.max(0, this.shieldFlash - deltaTime * 4)
    this.beamCooldown = Math.max(0, this.beamCooldown - deltaTime)

    if (this._isDying) {
      this.updateDeath(deltaTime)
      return
    }

    if (this.action === 'dormant') {
      this.actionTime += deltaTime
      const k = Math.min(1, this.actionTime / WAKE_TIME)
      this.applyStoneTint(1 - k)
      for (const m of this.crystalMaterials) m.emissiveIntensity = k * 1.2 * (0.6 + 0.4 * Math.sin(this.time * 18))
      this.holdStill()
      if (this.playerRef) this.turnToward(this.playerRef, deltaTime, 1.5)
      if (k >= 1) {
        this.action = null
        this.isAggressive = true
        this.aggressiveTimer = this.aggroTimeout
      }
      this.syncMesh()
      return
    }

    if (this.action) {
      this.advanceAction(deltaTime)
      this.updatePose(deltaTime)
      this.syncMesh()
      return
    }

    // Lance beam from range
    const player = this.playerRef
    if (player && this.beamCooldown <= 0 && this.knockbackTimer <= 0) {
      const d = Math.hypot(player.x - this.position.x, player.z - this.position.z)
      if (d >= BEAM_MIN_RANGE && d <= BEAM_RANGE && this.canSee(player)) {
        this.startAction('beam')
        this.aimBeam(Math.PI, true)
        this.syncMesh()
        return
      }
    }

    super.update(deltaTime)
    const mesh = this.getMesh()
    if (mesh) this.facing = mesh.rotation.y
  }

  /** Base chase reached melee range: start a telegraphed shield bash instead of hitting. */
  protected override performAttack(): void {
    if (this.action) return
    this.startAction('bash')
  }

  private startAction(action: Exclude<SentinelAction, null | 'dormant'>): void {
    this.action = action
    this.actionStage = 'windup'
    this.actionTime = 0
    this.bashHit = false
    this.beamHit = false
    this.holdStill()
  }

  private advanceAction(deltaTime: number): void {
    this.actionTime += deltaTime
    this.holdStill()
    const player = this.playerRef
    if (this.action === 'bash') {
      if (this.actionStage === 'windup') {
        if (player) this.turnToward(player, deltaTime, 4)
        if (this.actionTime >= BASH_WINDUP) {
          this.actionStage = 'active'
          this.actionTime = 0
          this.tryBash()
        }
      } else if (this.actionStage === 'active') {
        if (this.actionTime >= 0.15) { this.actionStage = 'recovery'; this.actionTime = 0 }
      } else if (this.actionTime >= BASH_RECOVERY) {
        this.endAction()
      }
      return
    }
    // beam
    if (this.actionStage === 'windup') {
      const k = this.actionTime / BEAM_WINDUP
      this.aimBeam(k < BEAM_LOCK_AT ? 2.4 * deltaTime : 0)
      if (this.actionTime >= BEAM_WINDUP) {
        this.actionStage = 'active'
        this.actionTime = 0
        this.checkBeamHit()
      }
    } else if (this.actionStage === 'active') {
      this.checkBeamHit()
      if (this.actionTime >= BEAM_ACTIVE) { this.actionStage = 'recovery'; this.actionTime = 0 }
    } else if (this.actionTime >= BEAM_RECOVERY) {
      this.beamCooldown = BEAM_COOLDOWN
      this.endAction()
    }
  }

  private endAction(): void {
    this.action = null
    this.actionTime = 0
    this.attackCooldown = this.attackCooldownDuration
    if (this.beam) this.beam.visible = false
  }

  private tryBash(): void {
    const player = this.playerRef
    if (!player || !this.damageFn || this.bashHit) return
    const dx = player.x - this.position.x
    const dz = player.z - this.position.z
    const d = Math.hypot(dx, dz)
    if (d > BASH_REACH || Math.abs(player.y - this.position.y) > 2.5) return
    const fx = Math.sin(this.facing)
    const fz = Math.cos(this.facing)
    if (d > 0.3 && (dx * fx + dz * fz) / d < 0.2) return // only in front
    this.bashHit = true
    const push = this.tmp.set(dx, 0, dz)
    if (push.lengthSq() > 1e-6) push.normalize()
    push.multiplyScalar(this.attackKnockbackHorizontal)
    push.y = this.attackKnockbackVertical
    this.damageFn(BASH_DAMAGE, push, 'melee')
  }

  private lanceOrigin(out: THREE.Vector3): THREE.Vector3 {
    const sin = Math.sin(this.facing)
    const cos = Math.cos(this.facing)
    const lx = 0.62
    const lz = 0.3
    return out.set(this.position.x + lx * cos + lz * sin, this.position.y + LANCE_Y, this.position.z - lx * sin + lz * cos)
  }

  /** Turn the beam toward the player's chest by at most `maxTurn` radians (snap: instantly). */
  private aimBeam(maxTurn: number, snap = false): void {
    const player = this.playerRef
    if (player) {
      const origin = this.lanceOrigin(this.tmp)
      const desired = this.tmp2.set(player.x, player.y + 1.1, player.z).sub(origin)
      if (desired.lengthSq() > 1e-4) {
        desired.normalize()
        if (snap) this.beamDir.copy(desired)
        else if (maxTurn > 0) {
          const angle = this.beamDir.angleTo(desired)
          if (angle > 1e-4) this.beamDir.lerp(desired, Math.min(1, maxTurn / angle)).normalize()
        }
      }
    }
    this.facing = Math.atan2(this.beamDir.x, this.beamDir.z)
    const origin = this.lanceOrigin(this.tmp)
    let length = BEAM_RANGE + 2
    for (let d = 0.5; d <= BEAM_RANGE + 2; d += 0.25) {
      if (this.solidQuery?.(Math.floor(origin.x + this.beamDir.x * d), Math.floor(origin.y + this.beamDir.y * d), Math.floor(origin.z + this.beamDir.z * d))) {
        length = d
        break
      }
    }
    this.beamLength = length
  }

  private checkBeamHit(): void {
    const player = this.playerRef
    if (!player || !this.damageFn || this.beamHit) return
    const origin = this.lanceOrigin(this.tmp)
    for (const h of [0.3, 1.0, 1.6]) {
      const p = this.tmp2.set(player.x, player.y + h, player.z).sub(origin)
      const along = THREE.MathUtils.clamp(p.dot(this.beamDir), 0, this.beamLength)
      const dx = p.x - this.beamDir.x * along
      const dy = p.y - this.beamDir.y * along
      const dz = p.z - this.beamDir.z * along
      if (dx * dx + dy * dy + dz * dz <= BEAM_HIT_RADIUS * BEAM_HIT_RADIUS) {
        this.beamHit = true
        const push = this.tmp.set(this.beamDir.x, 0, this.beamDir.z)
        if (push.lengthSq() > 1e-6) push.normalize()
        push.multiplyScalar(5)
        push.y = 2.5
        this.damageFn(BEAM_DAMAGE, push, 'projectile')
        return
      }
    }
  }

  private canSee(player: THREE.Vector3): boolean {
    if (!this.solidQuery) return true
    const from = this.lanceOrigin(this.tmp)
    const tx = player.x, ty = player.y + 1.6, tz = player.z
    const dist = Math.hypot(tx - from.x, ty - from.y, tz - from.z)
    const steps = Math.ceil(dist / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidQuery(Math.floor(from.x + (tx - from.x) * t), Math.floor(from.y + (ty - from.y) * t), Math.floor(from.z + (tz - from.z) * t))) return false
    }
    return true
  }

  private holdStill(): void {
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
      this.position.copy(body.position)
    }
    this.isWalking = false
  }

  private turnToward(target: THREE.Vector3, deltaTime: number, rate: number): void {
    const desired = Math.atan2(target.x - this.position.x, target.z - this.position.z)
    let delta = desired - this.facing
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    const step = rate * deltaTime
    this.facing += THREE.MathUtils.clamp(delta, -step, step)
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (!mesh) return
    mesh.position.copy(this.position)
    mesh.rotation.y = this.facing
  }

  private updatePose(_deltaTime: number): void {
    const shieldArm = this.shieldArm
    const lanceArm = this.lanceArm
    if (!shieldArm || !lanceArm) return
    let shieldRaise = 0
    let lanceRaise = 0
    let glow = 0.5
    if (this.action === 'bash') {
      const k = Math.min(1, this.actionTime / (this.actionStage === 'windup' ? BASH_WINDUP : 0.15))
      if (this.actionStage === 'windup') { shieldRaise = -1.1 * k; glow = 0.5 + k }
      else if (this.actionStage === 'active') { shieldRaise = -1.1 + 1.6 * k; glow = 1.5 }
      else shieldRaise = 0.5 * (1 - Math.min(1, this.actionTime / BASH_RECOVERY))
    } else if (this.action === 'beam') {
      lanceRaise = -Math.asin(THREE.MathUtils.clamp(this.beamDir.y, -1, 1))
      glow = this.actionStage === 'windup' ? 0.6 + 1.4 * (this.actionTime / BEAM_WINDUP) : 2
    }
    shieldArm.rotation.x = shieldRaise
    lanceArm.rotation.x = lanceRaise
    for (const m of this.crystalMaterials) m.emissiveIntensity = glow + this.shieldFlash * 2

    // Beam visual
    const beam = this.beam
    const core = this.beamCoreMaterial
    if (!beam || !core) return
    if (this.action !== 'beam' || this.actionStage === 'recovery') {
      beam.visible = false
      return
    }
    beam.visible = true
    const pitch = Math.asin(THREE.MathUtils.clamp(this.beamDir.y, -1, 1))
    beam.rotation.set(-pitch, 0, 0)
    const k = this.actionTime / BEAM_WINDUP
    if (this.actionStage === 'windup') {
      const locked = k >= BEAM_LOCK_AT
      const w = locked ? 0.09 : 0.05
      beam.scale.set(w, w, this.beamLength)
      core.opacity = locked ? 0.8 + 0.2 * Math.sin(this.time * 40) : 0.25 + 0.2 * Math.sin(this.time * 12)
    } else {
      const w = 0.35 + 0.05 * Math.sin(this.time * 50)
      beam.scale.set(w, w, this.beamLength)
      core.opacity = 0.9
    }
  }

  protected updateAnimations(deltaTime: number): void {
    // Walking (base chase): slow heavy stride; idle glow
    if (this.isWalking) {
      const swing = Math.sin(this.time * 5) * 0.35
      if (this.leftLeg) this.leftLeg.rotation.x = swing
      if (this.rightLeg) this.rightLeg.rotation.x = -swing
    } else {
      if (this.leftLeg) this.leftLeg.rotation.x *= 0.8
      if (this.rightLeg) this.rightLeg.rotation.x *= 0.8
    }
    if (!this.action) this.updatePose(deltaTime)
  }

  // ---- damage ----------------------------------------------------------------

  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    let damage = getPlayerAttackDamage(heldItem)
    const knockback = getPlayerAttackKnockback(heldItem)

    // The tower shield covers the front unless the sentinel is mid-attack
    const dx = playerPosition.x - this.position.x
    const dz = playerPosition.z - this.position.z
    const d = Math.hypot(dx, dz)
    const front = d > 1e-3 && (dx * Math.sin(this.facing) + dz * Math.cos(this.facing)) / d > SHIELD_COVER_COS
    const shieldUp = this.action === null || this.action === 'dormant'
    this.lastHitBlocked = front && shieldUp
    if (front && shieldUp) {
      damage *= SHIELD_DAMAGE_SHARE
      this.shieldFlash = 1
    }
    this.health -= damage

    const body = this.getPhysicsBody()
    if (body && d > 1e-3) {
      body.velocity.x = (-dx / d) * this.knockbackHorizontal * knockback
      body.velocity.z = (-dz / d) * this.knockbackHorizontal * knockback
    }

    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.isAggressive = false
      if (this.beam) this.beam.visible = false
    } else {
      // A hit wakes a dormant statue at once and keeps it hostile
      if (this.action === 'dormant') {
        this.action = null
        this.applyStoneTint(0)
      }
      this.isAggressive = true
      this.aggressiveTimer = this.aggroTimeout
    }
    return true
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    const t = Math.min(1, this.deathTimer / 1.2)
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      mesh.position.y -= t * 0.6
      mesh.scale.set(1 + t * 0.15, Math.max(0.02, 1 - t), 1 + t * 0.15)
    }
    this.applyStoneTint(t)
    for (const m of this.crystalMaterials) m.emissiveIntensity = (1 - t) * 2.5
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    if (this.deathTimer >= 1.2) this.kill()
  }

  override dispose(): void {
    this.shieldArm = null
    this.lanceArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.beam = null
    this.beamCoreMaterial = null
    this.crystalMaterials = []
    this.playerRef = null
    this.damageFn = null
    this.solidQuery = null
    super.dispose()
  }
}
