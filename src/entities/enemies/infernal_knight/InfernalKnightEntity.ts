import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { IronBarItem } from '../../../items/bars/iron/IronBarItem.ts'
import { CoalItem } from '../../../items/ores/coal/CoalItem.ts'
import { RawInferniumItem } from '../../../items/ores/infernium/RawInferniumItem.ts'
import { getPlayerAttackDamage } from '../../../combat/PlayerAttack.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Black-iron plate, crimson tabard, gold trim, molten weapon head
const PLATE = 0x2e2a2a
const PLATE_DARK = 0x1c1919
const TABARD = 0x6e1414
const GOLD = 0xa87a1e
const VISOR = 0xffb43c
const EMBER = 0xff6a1a
const SHIELD_FACE = 0x3a1414

// Dimensions (1 pixel = 1/16 block): a 2.1-block armoured giant of a man
const S = 0.0625
const LEG_H = 13 * S
const TORSO_H = 13 * S
const TORSO_W = 11 * S
const TORSO_D = 7 * S
const HELM = 8 * S
const ARM_L = 13 * S

/** Frontal hits within this half-angle of the facing hit the shield. */
const SHIELD_ARC = (65 * Math.PI) / 180
/** Share of a shielded hit's damage that gets through. */
const SHIELD_DAMAGE_FACTOR = 0.2

// Mace smash
const SMASH_DAMAGE = 9
const SMASH_WINDUP = 0.8
const SMASH_RECOVERY = 0.55
const SMASH_REACH = 3.0
const SMASH_ARC = (80 * Math.PI) / 180

// Shield bash charge
const BASH_DAMAGE = 6
const BASH_MIN_RANGE = 3.5
const BASH_MAX_RANGE = 7.5
const BASH_WINDUP = 0.55
const BASH_DASH_TIME = 0.45
const BASH_SPEED = 9.5
const BASH_RECOVERY = 0.7
const BASH_COOLDOWN = 6
const BASH_HIT_RANGE = 1.6
const BASH_KNOCKBACK = 11

type KnightAction = 'smash-windup' | 'smash-recover' | 'bash-windup' | 'bash-dash' | 'bash-recover'

/**
 * Infernal Knight - the Infernal Bastion's shield-bearer (dungeon garrison
 * only). Advances behind a tower shield: frontal hits only do 20 % (sparks,
 * a ringing flash). Its shield drops while it swings, charges and recovers -
 * flank it, or punish the openings:
 * - mace smash: the molten mace is raised high (0.8 s), then crashes down
 *   in front of it (9 damage)
 * - shield bash: from 3.5-7.5 blocks it crouches behind the shield (0.55 s),
 *   then charges (6 damage, heavy knockback) and is left open for 0.7 s
 *
 * 42 HP. Drops iron bars, coal and sometimes raw infernium.
 */
export class InfernalKnightEntity extends AggressiveEntity {
  readonly type = 'infernal_knight'

  private action: KnightAction | null = null
  private actionTime = 0
  private bashCooldown = 2.5
  private bashHit = false
  private readonly bashDir = new THREE.Vector3()

  private targetRef: THREE.Vector3 | null = null
  private damageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null
  private readonly knock = new THREE.Vector3()

  // Animation
  private walkPhase = Math.random() * Math.PI * 2
  private shieldFlash = 0
  private legs: THREE.Object3D[] = []
  private maceArm: THREE.Object3D | null = null
  private shieldArm: THREE.Object3D | null = null
  private shield: THREE.Object3D | null = null
  private upper: THREE.Object3D | null = null
  private shieldGlowMaterial: THREE.MeshBasicMaterial | null = null
  private maceHeadMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('infernal_knight', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 2.1, 0.9),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 42,
      attackDamage: SMASH_DAMAGE,
      attackRange: 2.4,
      attackCooldown: 1.4,
      detectionRange: 18,
      chaseSpeed: 3.2,
      walkSpeed: 1.6,
      jumpVelocity: 8.5,
      attackKnockbackHorizontal: 6,
      attackKnockbackVertical: 3.5,
      // Heavy plate: barely pushed around
      knockbackHorizontal: 2.5,
      knockbackVertical: 2,
      knockbackStunTime: 0.2,
      drops: [
        { createItem: () => new IronBarItem(), minCount: 0, maxCount: 2 },
        { createItem: () => new CoalItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new RawInferniumItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.targetRef = positionRef
  }

  override setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageCallback = callback
  }

  /** The shield is raised (not mid-attack, not staggered, not dying). */
  get isShieldUp(): boolean {
    return this.action === null && this.knockbackTimer <= 0 && this.isAlive && !this._isDying
  }

  private facingAngle(): number {
    return this.getMesh()?.rotation.y ?? 0
  }

  /** Is a hit from `from` caught by the raised shield? */
  private blocks(from: THREE.Vector3): boolean {
    if (!this.isShieldUp) return false
    const toAttacker = Math.atan2(from.x - this.position.x, from.z - this.position.z)
    const delta = Math.atan2(Math.sin(toAttacker - this.facingAngle()), Math.cos(toAttacker - this.facingAngle()))
    return Math.abs(delta) <= SHIELD_ARC
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    if (!this.blocks(playerPosition)) return super.onPlayerInteract(playerPosition, isLeftClick, heldItem)

    // Shield block: a sliver of the damage, no knockback, no stagger
    this.health -= getPlayerAttackDamage(heldItem) * SHIELD_DAMAGE_FACTOR
    this.shieldFlash = 1
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.knockbackTimer = 0
      this.isAggressive = false
      this.aggressiveTimer = 0
    } else {
      this.isAggressive = true
      this.aggressiveTimer = this.aggroTimeout
    }
    return true
  }

  /** The base AI wants to swing: start the telegraphed mace smash instead. */
  protected override performAttack(): void {
    if (this.action) return
    this.startAction('smash-windup')
  }

  private startAction(action: KnightAction | null): void {
    this.action = action
    this.actionTime = 0
  }

  override update(deltaTime: number): void {
    super.update(deltaTime)
    if (this._isDying || !this.isAlive) {
      this.action = null
      return
    }
    this.shieldFlash = Math.max(0, this.shieldFlash - deltaTime * 4)
    this.bashCooldown = Math.max(0, this.bashCooldown - deltaTime)

    const body = this.getPhysicsBody()
    const target = this.targetRef
    if (!body || !target) return
    if (this.knockbackTimer > 0 && this.action !== 'bash-dash') {
      // Staggered: any running attack is lost
      if (this.action) this.startAction(null)
      return
    }

    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    const dist = Math.hypot(dx, dz)
    this.actionTime += deltaTime

    switch (this.action) {
      case 'smash-windup':
        this.holdStill(body, dx, dz)
        if (this.actionTime >= SMASH_WINDUP) {
          this.smash(dx, dz, dist)
          this.startAction('smash-recover')
        }
        return
      case 'smash-recover':
        this.holdStill(body, null, null)
        if (this.actionTime >= SMASH_RECOVERY) this.startAction(null)
        return
      case 'bash-windup':
        this.holdStill(body, dx, dz)
        if (this.actionTime >= BASH_WINDUP) {
          this.bashDir.set(dx, 0, dz).normalize()
          this.bashHit = false
          this.startAction('bash-dash')
        }
        return
      case 'bash-dash':
        body.velocity.x = this.bashDir.x * BASH_SPEED
        body.velocity.z = this.bashDir.z * BASH_SPEED
        this.isWalking = true
        if (!this.bashHit && dist < BASH_HIT_RANGE && Math.abs(target.y - this.position.y) < 1.8) {
          this.bashHit = true
          this.hitPlayer(BASH_DAMAGE, BASH_KNOCKBACK, dx, dz, dist)
        }
        if (this.actionTime >= BASH_DASH_TIME || this.bashHit) this.startAction('bash-recover')
        return
      case 'bash-recover':
        this.holdStill(body, null, null)
        if (this.actionTime >= BASH_RECOVERY) this.startAction(null)
        return
    }

    // Free: consider a shield bash from mid range
    if (
      this.isAggressive && this.bashCooldown <= 0 && body.isOnGround &&
      dist >= BASH_MIN_RANGE && dist <= BASH_MAX_RANGE && Math.abs(target.y - this.position.y) < 1.5
    ) {
      this.bashCooldown = BASH_COOLDOWN + Math.random() * 2
      this.startAction('bash-windup')
    }
  }

  private holdStill(body: { velocity: THREE.Vector3 }, dx: number | null, dz: number | null): void {
    body.velocity.x = 0
    body.velocity.z = 0
    this.isWalking = false
    const mesh = this.getMesh()
    if (mesh && dx !== null && dz !== null && (dx !== 0 || dz !== 0)) mesh.rotation.y = Math.atan2(dx, dz)
  }

  private smash(dx: number, dz: number, dist: number): void {
    const target = this.targetRef
    if (!target || dist > SMASH_REACH) return
    if (Math.abs(target.y - this.position.y) > 2.2) return
    const toTarget = Math.atan2(dx, dz)
    const delta = Math.atan2(Math.sin(toTarget - this.facingAngle()), Math.cos(toTarget - this.facingAngle()))
    if (Math.abs(delta) > SMASH_ARC) return
    this.hitPlayer(SMASH_DAMAGE, this.attackKnockbackHorizontal, dx, dz, dist)
  }

  private hitPlayer(damage: number, knockback: number, dx: number, dz: number, dist: number): void {
    if (!this.damageCallback) return
    const inv = dist > 1e-3 ? 1 / dist : 0
    this.knock.set(dx * inv * knockback, this.attackKnockbackVertical, dz * inv * knockback)
    this.damageCallback(damage, this.knock)
  }

  // ===========================================================================
  // Model
  // ===========================================================================

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const plate = new THREE.MeshLambertMaterial({ color: PLATE })
    const plateDark = new THREE.MeshLambertMaterial({ color: PLATE_DARK })
    const tabard = new THREE.MeshLambertMaterial({ color: TABARD })
    const gold = new THREE.MeshLambertMaterial({ color: GOLD })
    const shieldFace = new THREE.MeshLambertMaterial({ color: SHIELD_FACE })
    for (const m of [plate, plateDark, tabard, gold, shieldFace]) this.registerMaterialForLighting(m)
    const visor = new THREE.MeshBasicMaterial({ color: VISOR })
    this.shieldGlowMaterial = new THREE.MeshBasicMaterial({ color: EMBER })
    this.maceHeadMaterial = new THREE.MeshBasicMaterial({ color: EMBER })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs (pivot at the hip)
    this.legs = []
    for (const side of [-1, 1]) {
      const leg = new THREE.Group()
      leg.position.set(side * 2.8 * S, LEG_H, 0)
      box(4.5 * S, LEG_H * 0.55, 4.5 * S, plate, 0, -LEG_H * 0.27, 0, leg)
      box(4.2 * S, LEG_H * 0.45, 4.8 * S, plateDark, 0, -LEG_H * 0.77, 0.3 * S, leg)
      box(4.6 * S, 1.6 * S, 6 * S, plateDark, 0, -LEG_H + 0.8 * S, 0.9 * S, leg) // sabaton
      root.add(leg)
      this.legs.push(leg)
    }

    // Upper body
    const upper = new THREE.Group()
    upper.position.y = LEG_H
    root.add(upper)
    this.upper = upper
    box(TORSO_W, TORSO_H, TORSO_D, plate, 0, TORSO_H / 2, 0, upper)
    box(TORSO_W * 0.7, TORSO_H * 0.95, 0.4 * S, tabard, 0, TORSO_H * 0.42, TORSO_D / 2 + 0.2 * S, upper) // tabard
    box(TORSO_W * 0.72, 0.8 * S, 0.5 * S, gold, 0, TORSO_H * 0.83, TORSO_D / 2 + 0.3 * S, upper) // gold collar trim
    box(TORSO_W + 1.5 * S, 2 * S, TORSO_D + 1 * S, plateDark, 0, 1 * S, 0, upper) // belt / faulds
    for (const side of [-1, 1]) {
      box(5 * S, 3 * S, 7.5 * S, plateDark, side * (TORSO_W / 2 + 1.5 * S), TORSO_H - 0.8 * S, 0, upper) // pauldrons
    }
    // Great helm with horns and a burning visor slit
    const helm = new THREE.Group()
    helm.position.set(0, TORSO_H + HELM / 2, 0)
    upper.add(helm)
    box(HELM * 0.9, HELM, HELM * 0.95, plate, 0, 0, 0, helm)
    box(HELM * 0.62, 1 * S, 0.4 * S, visor, 0, 0.6 * S, HELM * 0.48, helm)
    box(0.8 * S, HELM * 0.6, 0.4 * S, gold, 0, -0.8 * S, HELM * 0.48, helm) // nasal ridge
    for (const side of [-1, 1]) {
      const horn = box(1.6 * S, 4.5 * S, 1.6 * S, plateDark, side * HELM * 0.55, HELM * 0.55, -0.5 * S, helm)
      horn.rotation.z = -side * 0.55
    }

    // Mace arm (right, -X side; pivot at the shoulder)
    const maceArm = new THREE.Group()
    maceArm.position.set(-(TORSO_W / 2 + 2 * S), TORSO_H - 1.5 * S, 0)
    upper.add(maceArm)
    box(3.5 * S, ARM_L, 3.5 * S, plate, 0, -ARM_L / 2, 0, maceArm)
    const haft = box(1.2 * S, 12 * S, 1.2 * S, plateDark, 0, -ARM_L + 1 * S, 4 * S, maceArm)
    haft.rotation.x = Math.PI / 2
    const head = box(4.2 * S, 4.2 * S, 4.2 * S, this.maceHeadMaterial, 0, -ARM_L + 1 * S, 10 * S, maceArm)
    head.castShadow = false
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      box(1 * S, 1 * S, 1 * S, plateDark, ox * 2.6 * S, -ARM_L + 1 * S + oy * 2.6 * S, 10 * S, maceArm) // flanges
    }
    this.maceArm = maceArm

    // Shield arm (left, +X side) holding a tower shield in front
    const shieldArm = new THREE.Group()
    shieldArm.position.set(TORSO_W / 2 + 2 * S, TORSO_H - 1.5 * S, 0)
    upper.add(shieldArm)
    box(3.5 * S, ARM_L * 0.8, 3.5 * S, plate, 0, -ARM_L * 0.4, 0, shieldArm)
    const shield = new THREE.Group()
    shield.position.set(-3.5 * S, -ARM_L * 0.55, 5 * S)
    shieldArm.add(shield)
    box(11 * S, 20 * S, 1.4 * S, shieldFace, 0, 0, 0, shield)
    box(12 * S, 1.2 * S, 1.8 * S, gold, 0, 9.6 * S, 0, shield) // rim top
    box(12 * S, 1.2 * S, 1.8 * S, gold, 0, -9.6 * S, 0, shield) // rim bottom
    box(1.2 * S, 20 * S, 1.8 * S, gold, 5.6 * S, 0, 0, shield)
    box(1.2 * S, 20 * S, 1.8 * S, gold, -5.6 * S, 0, 0, shield)
    const glyph = box(3 * S, 8 * S, 0.4 * S, this.shieldGlowMaterial, 0, 1 * S, 0.9 * S, shield) // ember sigil
    glyph.castShadow = false
    box(7 * S, 1.6 * S, 0.4 * S, this.shieldGlowMaterial, 0, 2.5 * S, 0.9 * S, shield)
    this.shieldArm = shieldArm
    this.shield = shield

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [...this.legs, upper, maceArm, shieldArm, shield],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  protected updateAnimations(deltaTime: number): void {
    const t = this.actionTime
    // Walk
    if (this.isWalking) {
      this.walkPhase += deltaTime * (this.action === 'bash-dash' ? 16 : 7)
      const swing = Math.sin(this.walkPhase) * 0.5
      if (this.legs.length === 2) {
        this.legs[0].rotation.x = swing
        this.legs[1].rotation.x = -swing
      }
    } else {
      for (const leg of this.legs) leg.rotation.x *= 0.85
    }

    if (!this.maceArm || !this.shieldArm || !this.upper) return
    // Defaults: shield held across the front, mace low at the side
    let maceX = -0.25
    let shieldX = -0.9
    let shieldY = 0.35
    let lean = 0
    switch (this.action) {
      case 'smash-windup': {
        const k = Math.min(1, t / SMASH_WINDUP)
        maceX = -0.25 - 2.75 * k // raised high behind the helm
        shieldX = -0.2 // shield lowered: an opening
        shieldY = 0.1
        lean = -0.12 * k
        break
      }
      case 'smash-recover': {
        const k = Math.min(1, t / SMASH_RECOVERY)
        maceX = -1.4 + 1.15 * k
        shieldX = -0.2
        shieldY = 0.1
        lean = 0.3 * (1 - k)
        break
      }
      case 'bash-windup':
        shieldX = -1.45 // shield thrust forward, crouched behind it
        shieldY = 0
        lean = 0.35 * Math.min(1, t / BASH_WINDUP)
        break
      case 'bash-dash':
        shieldX = -1.5
        shieldY = 0
        lean = 0.4
        break
      case 'bash-recover':
        shieldX = -0.1 // shield swung wide: wide open
        shieldY = 0.6
        lean = 0.1
        break
    }
    this.maceArm.rotation.x = maceX
    this.shieldArm.rotation.x = shieldX
    this.shieldArm.rotation.y = shieldY
    // The tower shield stays upright whatever the arm does
    if (this.shield) this.shield.rotation.x = -shieldX - lean
    this.upper.rotation.x = lean

    // Shield sigil flares on a block; mace head glows hotter on the windup
    const smashHeat = this.action === 'smash-windup' ? Math.min(1, t / SMASH_WINDUP) : 0
    this.maceHeadMaterial?.color.setRGB(1, 0.42 + 0.5 * smashHeat, 0.1 + 0.6 * smashHeat)
    const flash = this.shieldFlash
    this.shieldGlowMaterial?.color.setRGB(1, 0.42 + 0.58 * flash, 0.1 + 0.85 * flash)
  }

  dispose(): void {
    this.legs = []
    this.maceArm = null
    this.shieldArm = null
    this.shield = null
    this.upper = null
    this.targetRef = null
    this.damageCallback = null
    super.dispose()
  }
}
