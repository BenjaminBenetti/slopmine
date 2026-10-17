import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage } from '../../../combat/PlayerAttack.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { RimeCrystalItem } from '../../../items/materials/rime_crystal/RimeCrystalItem.ts'
import { SteelBarItem } from '../../../items/bars/steel/SteelBarItem.ts'
import { DiamondItem } from '../../../items/ores/diamond/DiamondItem.ts'

const PLATE = 0x3a4658
const PLATE_DARK = 0x262f3d
const TRIM = 0xb9d0e2
const SHIELD = 0x6f97b8
const SHIELD_RIM = 0x2f3744
const BLADE = 0xcfe7f6
const CAPE = 0x1d2a44
const VISOR = 0x9ff4ff

/** Telegraph: sword raised high, shield lowered (the punish window). */
const WINDUP_TIME = 0.7
const SWING_TIME = 0.25
/** The swing still lands if the player is within attackRange + this as it falls. */
const SWING_REACH_MARGIN = 0.6
const FROSTBITE_SECONDS = 3
/** Shield arc: hits from within ±this angle of where he faces are blocked. */
const SHIELD_HALF_ARC = Math.PI / 3
/** Damage a blocked hit still deals. */
const BLOCKED_DAMAGE = 0.3
const BLOCK_FLASH_TIME = 0.25
const SHIELD_GLOW = 0.004

/**
 * Frozen Knight - the Rime Sovereign's household guard, in frost-rimed
 * plate behind a tower shield of glacial ice (Frozen Citadel garrisons;
 * dungeon-only). He advances shield-first: hits from the front glance off
 * the shield (30 % damage, no stagger, a cold flash). To hurt him, flank him
 * or punish his attack: he raises his sword overhead for 0.7 s - lowering
 * the shield - then cuts down for 10 and Frostbite. Stepping back out of
 * reach during the wind-up makes the cut miss.
 *
 * Stats: 45 HP, 10 damage + Frostbite 3 s, 3.4 blocks/s, 20-block detection.
 * Drops: 1-2 rime crystals, 0-1 steel bar, 20 % a diamond.
 */
export class FrozenKnightEntity extends AggressiveEntity {
  readonly type = 'frozen_knight'

  private walkPhase = Math.random() * Math.PI * 2
  private windupTimer = -1
  private swingTimer = -1
  private blockFlash = 0
  private playerPos: THREE.Vector3 | null = null

  private torso: THREE.Group | null = null
  private swordArm: THREE.Group | null = null
  private shieldArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private shieldMaterial: THREE.MeshLambertMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('frozen_knight', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.8, 2.0, 0.8),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 45,
      attackDamage: 10,
      attackRange: 2.4,
      attackCooldown: 2.0,
      detectionRange: 20,
      chaseSpeed: 3.4,
      walkSpeed: 1.4,
      attackKnockbackHorizontal: 7,
      attackKnockbackVertical: 4,
      knockbackHorizontal: 3, // plate: barely budges
      knockbackVertical: 2,
      knockbackStunTime: 0.3,
      drops: [
        { createItem: () => new RimeCrystalItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new SteelBarItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  override setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerPos = positionRef
  }

  /** True while the shield covers his front (not mid-attack). */
  get isGuarding(): boolean {
    return this.windupTimer < 0 && this.swingTimer < 0 && !this._isDying
  }

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const lit = (c: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color: c })
      this.registerMaterialForLighting(m)
      return m
    }
    const plate = lit(PLATE)
    const plateDark = lit(PLATE_DARK)
    const trim = lit(TRIM)
    const blade = lit(BLADE)
    const cape = lit(CAPE)
    const shieldRim = lit(SHIELD_RIM)
    // A faint base emissive keeps the shield its own mesh (the optimizer only
    // merges non-emissive boxes), so the block flash can light it up
    this.shieldMaterial = new THREE.MeshLambertMaterial({ color: SHIELD, emissive: new THREE.Color(SHIELD_GLOW, SHIELD_GLOW, SHIELD_GLOW) })
    this.registerMaterialForLighting(this.shieldMaterial)
    const visor = new THREE.MeshBasicMaterial({ color: VISOR })

    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    // Legs (pivot at the hips): greaves and sabatons
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 0.17, 0.9, 0)
      box(leg, 0.26, 0.9, 0.3, 0, -0.45, 0, plate)
      box(leg, 0.3, 0.12, 0.34, 0, -0.42, 0.02, trim) // knee cop
      box(leg, 0.28, 0.12, 0.4, 0, -0.84, 0.05, plateDark)
      root.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    // Torso, tabard-cape, pauldrons, great helm with glowing visor
    const torso = new THREE.Group()
    torso.position.set(0, 0.9, 0)
    root.add(torso)
    this.torso = torso
    box(torso, 0.66, 0.74, 0.4, 0, 0.4, 0, plate)
    box(torso, 0.5, 0.5, 0.06, 0, 0.42, 0.22, plateDark) // breastplate ridge
    box(torso, 0.7, 0.08, 0.44, 0, 0.06, 0, trim) // belt
    box(torso, 0.6, 0.96, 0.06, 0, 0.22, -0.24, cape) // cape
    box(torso, 0.3, 0.22, 0.48, -0.44, 0.74, 0, trim) // pauldrons
    box(torso, 0.3, 0.22, 0.48, 0.44, 0.74, 0, trim)
    box(torso, 0.42, 0.44, 0.42, 0, 1.0, 0.02, plate) // great helm
    box(torso, 0.3, 0.05, 0.02, 0, 1.02, 0.24, visor) // visor slit (glows)
    box(torso, 0.06, 0.2, 0.36, 0, 1.3, 0.0, trim) // frost crest

    // Shield arm (left): a tall tower shield of glacial ice held in front
    const shieldArm = new THREE.Group()
    shieldArm.position.set(-0.42, 0.66, 0.05)
    box(shieldArm, 0.2, 0.62, 0.22, 0, -0.3, 0, plate)
    box(shieldArm, 0.62, 1.1, 0.1, 0.14, -0.36, 0.3, this.shieldMaterial) // shield face
    box(shieldArm, 0.68, 0.08, 0.12, 0.14, 0.2, 0.3, shieldRim) // rim top
    box(shieldArm, 0.68, 0.08, 0.12, 0.14, -0.92, 0.3, shieldRim) // rim bottom
    box(shieldArm, 0.08, 1.1, 0.12, -0.16, -0.36, 0.3, shieldRim) // rim sides
    box(shieldArm, 0.08, 1.1, 0.12, 0.44, -0.36, 0.3, shieldRim)
    box(shieldArm, 0.14, 0.14, 0.04, 0.14, -0.36, 0.37, trim) // boss
    torso.add(shieldArm)
    this.shieldArm = shieldArm

    // Sword arm (right): long pale ice blade
    const swordArm = new THREE.Group()
    swordArm.position.set(0.42, 0.66, 0)
    box(swordArm, 0.2, 0.62, 0.22, 0, -0.3, 0, plate)
    box(swordArm, 0.24, 0.16, 0.24, 0, -0.64, 0, plateDark) // gauntlet
    box(swordArm, 0.06, 0.16, 0.06, 0, -0.76, 0.08, plateDark) // grip
    box(swordArm, 0.3, 0.05, 0.08, 0, -0.68, 0.12, trim) // guard
    box(swordArm, 0.08, 1.05, 0.04, 0, -0.68, 0.66, blade).rotation.x = Math.PI / 2 // blade forward
    torso.add(swordArm)
    this.swordArm = swordArm

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [this.torso, this.swordArm, this.shieldArm, this.leftLeg, this.rightLeg],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  /** Start the telegraphed cut instead of hitting at once. */
  protected override performAttack(): void {
    if (this.windupTimer < 0 && this.swingTimer < 0) this.windupTimer = 0
  }

  override update(deltaTime: number): void {
    this.blockFlash = Math.max(0, this.blockFlash - deltaTime)
    if (this.windupTimer >= 0 && !this._isDying) {
      this.windupTimer += deltaTime
      if (this.windupTimer >= WINDUP_TIME) {
        this.windupTimer = -1
        this.swingTimer = 0
        const p = this.playerPos
        if (p && this.position.distanceTo(p) <= this.attackRange + SWING_REACH_MARGIN) {
          super.performAttack()
          playerEffects.apply(StatusEffectIds.SLOWNESS, FROSTBITE_SECONDS, 1)
        }
      }
    } else if (this.swingTimer >= 0) {
      this.swingTimer += deltaTime
      if (this.swingTimer >= SWING_TIME) this.swingTimer = -1
    }
    super.update(deltaTime)
  }

  /**
   * Frontal hits while guarding glance off the shield: 30 % damage, no
   * stagger. Everything else lands normally.
   */
  override onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    const blocked = this.isGuarding && this.isInFront(playerPosition)
    if (!blocked) return super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    // Pre-pay the blocked share so the base hit (same damage, computed now)
    // nets BLOCKED_DAMAGE of it
    const damage = getPlayerAttackDamage(heldItem)
    this.health += damage * (1 - BLOCKED_DAMAGE)
    const result = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    // The shield takes the impact: no stagger, no push
    this.knockbackTimer = 0
    const body = this.getPhysicsBody()
    if (body) { body.velocity.x = 0; body.velocity.z = 0 }
    this.blockFlash = BLOCK_FLASH_TIME
    return result
  }

  private isInFront(from: THREE.Vector3): boolean {
    const facing = this.getMesh()?.rotation.y ?? 0
    const toward = Math.atan2(from.x - this.position.x, from.z - this.position.z)
    let d = toward - facing
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return Math.abs(d) <= SHIELD_HALF_ARC
  }

  override getDrops(): IItem[] {
    const drops = super.getDrops()
    if (drops.length > 0 && Math.random() < 0.2) drops.push(new DiamondItem())
    return drops
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.shieldMaterial) {
      const f = this.blockFlash / BLOCK_FLASH_TIME
      this.shieldMaterial.emissive.setRGB(SHIELD_GLOW + 0.35 * f, SHIELD_GLOW + 0.6 * f, SHIELD_GLOW + 0.75 * f)
    }
    let swordX = -0.2
    let shieldX = -0.15
    let shieldZ = 0
    let lean = 0
    if (this.windupTimer >= 0) {
      const p = Math.min(1, this.windupTimer / WINDUP_TIME)
      const e = 1 - (1 - p) * (1 - p)
      swordX = -0.2 - 2.6 * e // sword raised high overhead
      shieldX = -0.15 + 0.5 * e // shield drops away from the front
      shieldZ = 0.45 * e
      lean = -0.12 * e
    } else if (this.swingTimer >= 0) {
      const p = Math.min(1, this.swingTimer / SWING_TIME)
      swordX = -2.8 + 3.3 * p
      shieldX = 0.35
      shieldZ = 0.45
      lean = 0.22 * p
    }
    if (this.swordArm) this.swordArm.rotation.x = swordX
    if (this.shieldArm) { this.shieldArm.rotation.x = shieldX; this.shieldArm.rotation.z = shieldZ }
    if (this.torso) this.torso.rotation.x = lean

    const walking = this.isWalking && this.windupTimer < 0
    if (walking) this.walkPhase += deltaTime * 6
    const swing = walking ? Math.sin(this.walkPhase) * 0.4 : 0
    if (this.leftLeg) this.leftLeg.rotation.x = swing
    if (this.rightLeg) this.rightLeg.rotation.x = -swing
  }

  dispose(): void {
    this.torso = null
    this.swordArm = null
    this.shieldArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.shieldMaterial = null
    this.playerPos = null
    super.dispose()
  }
}
