import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { GlowcapItem } from '../../../items/food/glowcap/GlowcapItem.ts'
import { CorruptedEssenceItem } from '../../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

// Colours: emberwood-fibre body, crimson cap, teal bioluminescence
const STALK = 0x5a1a22
const STALK_DARK = 0x3a1016
const FIBRE = 0x7f2a2c
const CAP = 0x8a2324
const CAP_SPOT = 0xe07a30
const GLOW_TEAL = 0x5ae6cc

const S = 0.0625 // 1 "pixel" = 1/16 block

/** Seconds of poison per landed claw swipe. */
const POISON_SECONDS = 4

/**
 * Spore stalker - a lanky fungal predator of the Ember Grove: a fibrous
 * emberwood body under a broad crimson cap, long tendril arms, and teal
 * gills glowing where a face should be. Its claws carry spores: every hit
 * poisons.
 *
 * Stats: 32 HP, 6 damage + poison (4 s), 2.4 block reach, 1.3 s cooldown,
 * 18 block detection, 4.2 blocks/s chase.
 * Drops: 1-2 glowcaps, 0-1 corrupted essence.
 */
export class SporeStalkerEntity extends AggressiveEntity {
  readonly type = 'spore_stalker'

  private walkPhase = Math.random() * Math.PI * 2
  private glowPhase = Math.random() * Math.PI * 2
  private attackPhase = 0
  private isAttacking = false

  private leftArm: THREE.Group | null = null
  private rightArm: THREE.Group | null = null
  private leftLeg: THREE.Group | null = null
  private rightLeg: THREE.Group | null = null
  private capGroup: THREE.Group | null = null
  private glowMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('spore_stalker', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.6, 1.95, 0.6),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 32,
      attackDamage: 6,
      attackRange: 2.4,
      attackCooldown: 1.3,
      detectionRange: 18,
      chaseSpeed: 4.2,
      walkSpeed: 1.5,
      attackKnockbackHorizontal: 4.0,
      attackKnockbackVertical: 3.0,
      drops: [
        { createItem: () => new GlowcapItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new CorruptedEssenceItem(), minCount: 0, maxCount: 1 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    const stalk = new THREE.MeshLambertMaterial({ color: STALK })
    const stalkDark = new THREE.MeshLambertMaterial({ color: STALK_DARK })
    const fibre = new THREE.MeshLambertMaterial({ color: FIBRE })
    const cap = new THREE.MeshLambertMaterial({ color: CAP })
    for (const m of [stalk, stalkDark, fibre, cap]) this.registerMaterialForLighting(m)
    // Glowing parts stay full-bright
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW_TEAL })
    const spot = new THREE.MeshBasicMaterial({ color: CAP_SPOT })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    const legH = 14 * S
    const bodyH = 11 * S
    const bodyY = legH + bodyH / 2

    // Legs: root-like stalks with splayed feet
    const makeLeg = (side: number): THREE.Group => {
      const leg = new THREE.Group()
      leg.position.set(side * 2 * S, legH, 0)
      box(2.2 * S, legH, 2.2 * S, stalk, 0, -legH / 2, 0, leg)
      box(4 * S, 1.2 * S, 4.5 * S, stalkDark, 0, -legH + 0.6 * S, 0.6 * S, leg)
      group.add(leg)
      return leg
    }
    this.leftLeg = makeLeg(-1)
    this.rightLeg = makeLeg(1)

    // Body: narrow fibrous torso with glowing teal veins
    box(6 * S, bodyH, 3.5 * S, fibre, 0, bodyY, 0, group)
    box(4 * S, bodyH * 0.8, 3.6 * S, stalkDark, 0, bodyY - 0.5 * S, -0.1 * S, group)
    box(0.8 * S, bodyH * 0.7, 0.4 * S, this.glowMaterial, -1.4 * S, bodyY, 1.85 * S, group)
    box(0.8 * S, bodyH * 0.5, 0.4 * S, this.glowMaterial, 1.2 * S, bodyY + 1 * S, 1.85 * S, group)

    // Arms: long, thin, ending in three tendril claws
    const shoulderY = legH + bodyH - 1 * S
    const armLen = 15 * S
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group()
      arm.position.set(side * 4 * S, shoulderY, 0)
      box(1.8 * S, armLen, 1.8 * S, stalk, 0, -armLen / 2, 0, arm)
      for (const f of [-1, 0, 1]) {
        box(0.7 * S, 4 * S, 0.7 * S, stalkDark, f * 0.8 * S, -armLen - 1.8 * S, f === 0 ? 0.5 * S : 0, arm)
      }
      box(0.6 * S, 0.6 * S, 0.6 * S, this.glowMaterial!, 0, -armLen - 3.6 * S, 0.5 * S, arm)
      group.add(arm)
      return arm
    }
    this.leftArm = makeArm(-1)
    this.rightArm = makeArm(1)

    // Head: a broad crimson cap on a short neck, glowing gills beneath and
    // two teal glints where eyes should be
    const capGroup = new THREE.Group()
    capGroup.position.set(0, legH + bodyH, 0)
    box(2.5 * S, 2.5 * S, 2.5 * S, stalk, 0, 1.2 * S, 0, capGroup)
    box(12 * S, 2.2 * S, 12 * S, cap, 0, 3.6 * S, 0, capGroup)
    box(8 * S, 1.8 * S, 8 * S, cap, 0, 5.4 * S, 0, capGroup)
    box(4 * S, 1 * S, 4 * S, cap, 0, 6.6 * S, 0, capGroup)
    box(11 * S, 0.4 * S, 11 * S, this.glowMaterial, 0, 2.4 * S, 0, capGroup)
    for (const side of [-1, 1]) {
      box(1.2 * S, 0.8 * S, 0.4 * S, this.glowMaterial, side * 1.3 * S, 1.4 * S, 1.3 * S, capGroup)
    }
    // Ember spots on the cap
    const spots: Array<[number, number, number]> = [[3, 4.75, 2], [-3.5, 4.75, -1], [1, 6.35, -1.5], [-1.5, 4.75, 3.5], [4, 3.6, -3]]
    for (const [x, y, z] of spots) box(1.4 * S, 0.3 * S, 1.4 * S, spot, x * S, y * S, z * S, capGroup)
    group.add(capGroup)
    this.capGroup = capGroup

    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.capGroup],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return group
  }

  /** Claw swipe: damage (base class) plus spore poison. */
  protected override performAttack(): void {
    super.performAttack()
    playerEffects.apply(StatusEffectIds.POISON, POISON_SECONDS, 1)
    this.isAttacking = true
    this.attackPhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    this.glowPhase += deltaTime * (this.isAggressive ? 5 : 1.8)
    if (this.glowMaterial) {
      const k = 0.7 + 0.3 * Math.sin(this.glowPhase)
      this.glowMaterial.color.setHex(GLOW_TEAL).multiplyScalar(k)
    }

    if (this.isAttacking) {
      this.attackPhase += deltaTime * 9
      const t = Math.min(1, this.attackPhase / Math.PI)
      const swing = -2.4 + 2.9 * (1 - Math.pow(1 - t, 3))
      if (this.leftArm) this.leftArm.rotation.x = swing
      if (this.rightArm) this.rightArm.rotation.x = swing
      // The cap puffs as spores burst out
      if (this.capGroup) {
        const puff = 1 + Math.sin(t * Math.PI) * 0.18
        this.capGroup.scale.set(puff, 1, puff)
      }
      if (this.attackPhase >= Math.PI) {
        this.isAttacking = false
        if (this.capGroup) this.capGroup.scale.set(1, 1, 1)
      }
      return
    }

    if (this.isWalking) {
      this.walkPhase += deltaTime * (this.isAggressive ? 9 : 5)
      const swing = Math.sin(this.walkPhase) * 0.5
      if (this.leftLeg) this.leftLeg.rotation.x = swing
      if (this.rightLeg) this.rightLeg.rotation.x = -swing
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.6 - (this.isAggressive ? 0.6 : 0)
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.6 - (this.isAggressive ? 0.6 : 0)
    } else {
      for (const limb of [this.leftLeg, this.rightLeg, this.leftArm, this.rightArm]) {
        if (limb) limb.rotation.x *= 0.85
      }
      // Idle: the cap tilts slowly, as if listening
      if (this.capGroup) this.capGroup.rotation.z = Math.sin(this.glowPhase * 0.5) * 0.12
    }
  }

  dispose(): void {
    this.leftArm = null
    this.rightArm = null
    this.leftLeg = null
    this.rightLeg = null
    this.capGroup = null
    this.glowMaterial = null
    super.dispose()
  }
}
