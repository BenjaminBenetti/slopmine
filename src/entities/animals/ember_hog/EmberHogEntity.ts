import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { RawEmberHogItem } from '../../../items/food/raw_ember_hog/RawEmberHogItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Ember hog colours: crimson bristled hide, darker legs, bone tusks and the
// teal glow of the fungus growing on its back
const HIDE = 0x8a2a26
const HIDE_DARK = 0x5a1a1c
const BRISTLE = 0x3e1416
const SNOUT = 0xb0605a
const TUSK = 0xe8dcc0
const HOOF = 0x2a1012
const CAP = 0xa8302a
const GLOW_TEAL = 0x56e0c8
const EYE_EMBER = 0xffa040

const SCALE = 0.0625 // 1 "pixel" = 1/16 block
const BODY_W = 11 * SCALE
const BODY_H = 9 * SCALE
const BODY_D = 16 * SCALE
const HEAD_W = 8 * SCALE
const HEAD_H = 7 * SCALE
const HEAD_D = 7 * SCALE
const SNOUT_W = 5 * SCALE
const SNOUT_H = 3.5 * SCALE
const SNOUT_D = 3 * SCALE
const LEG_W = 3 * SCALE
const LEG_H = 5 * SCALE

/**
 * Ember hog - a stocky crimson boar of the Ember Grove with glowing fungi
 * sprouting from its back. It grazes on mycelium and leaves the player
 * alone, but gores back when hit. The Hell layer's meat.
 *
 * Stats: 26 HP, 5 damage when provoked, 1.4 s attack cooldown.
 * Drops: 1-3 raw ember hog.
 */
export class EmberHogEntity extends AggressiveEntity {
  readonly type = 'ember_hog'

  private legPhase = Math.random() * Math.PI * 2
  private idlePhase = Math.random() * Math.PI * 2
  private chargePhase = 0
  private isCharging = false

  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private glowMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('ember_hog', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 0.95, 1.2),
      aggressionMode: AggressionMode.AGGRESSIVE_WHEN_PROVOKED,
      maxHealth: 26,
      attackDamage: 5,
      attackRange: 1.9,
      attackCooldown: 1.4,
      detectionRange: 14,
      chaseSpeed: 4.6,
      walkSpeed: 1.4,
      attackKnockbackHorizontal: 6.0,
      attackKnockbackVertical: 3.5,
      provokedDuration: 8,
      drops: [{ createItem: () => new RawEmberHogItem(), minCount: 1, maxCount: 3 }],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    const hide = new THREE.MeshLambertMaterial({ color: HIDE })
    const hideDark = new THREE.MeshLambertMaterial({ color: HIDE_DARK })
    const bristle = new THREE.MeshLambertMaterial({ color: BRISTLE })
    const snout = new THREE.MeshLambertMaterial({ color: SNOUT })
    const tusk = new THREE.MeshLambertMaterial({ color: TUSK })
    const hoof = new THREE.MeshLambertMaterial({ color: HOOF })
    const cap = new THREE.MeshLambertMaterial({ color: CAP })
    for (const m of [hide, hideDark, bristle, snout, tusk, hoof, cap]) this.registerMaterialForLighting(m)
    // Glowing parts stay full-bright (not registered for world light)
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW_TEAL })
    const eye = new THREE.MeshBasicMaterial({ color: EYE_EMBER })

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    const bodyY = LEG_H + BODY_H / 2
    box(BODY_W, BODY_H, BODY_D, hide, 0, bodyY, 0)
    // Hunched shoulders and a bristly ridge down the spine
    box(BODY_W * 1.05, BODY_H * 0.5, BODY_D * 0.4, hide, 0, bodyY + BODY_H * 0.35, BODY_D * 0.22)
    box(2 * SCALE, 2 * SCALE, BODY_D * 0.85, bristle, 0, bodyY + BODY_H * 0.62, 0)
    box(BODY_W * 0.8, BODY_H * 0.3, BODY_D * 0.9, hideDark, 0, bodyY - BODY_H * 0.4, 0)

    // Fungi growing from the back: little crimson caps with glowing gills
    const fungi: Array<[number, number, number]> = [[-2.5, 3, 1], [2, 2.2, -2], [0.5, 3.6, -5]]
    for (const [fx, fh, fz] of fungi) {
      const stemH = fh * SCALE
      const baseY = bodyY + BODY_H / 2
      box(1.2 * SCALE, stemH, 1.2 * SCALE, snout, fx * SCALE, baseY + stemH / 2, fz * SCALE)
      box(3.6 * SCALE, 1.4 * SCALE, 3.6 * SCALE, cap, fx * SCALE, baseY + stemH + 0.7 * SCALE, fz * SCALE)
      box(3.0 * SCALE, 0.4 * SCALE, 3.0 * SCALE, this.glowMaterial, fx * SCALE, baseY + stemH - 0.1 * SCALE, fz * SCALE)
    }
    // A few glowing spore nodules on the flanks
    box(1.4 * SCALE, 1.4 * SCALE, 1.4 * SCALE, this.glowMaterial, BODY_W / 2 + 0.2 * SCALE, bodyY + 1 * SCALE, 2 * SCALE)
    box(1.2 * SCALE, 1.2 * SCALE, 1.2 * SCALE, this.glowMaterial, -BODY_W / 2 - 0.2 * SCALE, bodyY - 1 * SCALE, -3 * SCALE)

    // Head
    const headGroup = new THREE.Group()
    headGroup.position.set(0, bodyY + 1 * SCALE, BODY_D / 2 + HEAD_D / 2 - 1 * SCALE)
    box(HEAD_W, HEAD_H, HEAD_D, hide, 0, 0, 0, headGroup)
    box(SNOUT_W, SNOUT_H, SNOUT_D, snout, 0, -HEAD_H * 0.2, HEAD_D / 2 + SNOUT_D / 2, headGroup)
    box(1 * SCALE, 1 * SCALE, 0.4 * SCALE, hoof, -1.2 * SCALE, -HEAD_H * 0.2, HEAD_D / 2 + SNOUT_D + 0.1 * SCALE, headGroup)
    box(1 * SCALE, 1 * SCALE, 0.4 * SCALE, hoof, 1.2 * SCALE, -HEAD_H * 0.2, HEAD_D / 2 + SNOUT_D + 0.1 * SCALE, headGroup)
    // Curved tusks
    for (const side of [-1, 1]) {
      box(1.2 * SCALE, 3 * SCALE, 1.2 * SCALE, tusk, side * (SNOUT_W / 2 + 0.4 * SCALE), -HEAD_H * 0.15, HEAD_D / 2 + SNOUT_D * 0.6, headGroup)
      box(1.2 * SCALE, 1.2 * SCALE, 1.6 * SCALE, tusk, side * (SNOUT_W / 2 + 0.4 * SCALE), HEAD_H * 0.05, HEAD_D / 2 + SNOUT_D * 0.9, headGroup)
      // Ears
      box(2 * SCALE, 2.5 * SCALE, 1 * SCALE, hideDark, side * HEAD_W * 0.35, HEAD_H / 2 + 1 * SCALE, -HEAD_D * 0.2, headGroup)
      // Ember eyes
      box(1.2 * SCALE, 1 * SCALE, 0.3 * SCALE, eye, side * HEAD_W * 0.28, HEAD_H * 0.15, HEAD_D / 2 + 0.05 * SCALE, headGroup)
    }
    group.add(headGroup)
    this.head = headGroup

    // Legs with dark hooves
    this.legs = []
    const legX = BODY_W / 2 - LEG_W / 2
    const legZ = BODY_D / 2 - LEG_W / 2 - 1 * SCALE
    for (const [x, z] of [[legX, legZ], [-legX, legZ], [legX, -legZ], [-legX, -legZ]]) {
      const leg = box(LEG_W, LEG_H, LEG_W, hideDark, x, LEG_H / 2, z)
      box(LEG_W * 1.05, 1.2 * SCALE, LEG_W * 1.05, hoof, 0, -LEG_H / 2 + 0.6 * SCALE, 0, leg)
      this.legs.push(leg)
    }

    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, this.head],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return group
  }

  protected override performAttack(): void {
    super.performAttack()
    this.isCharging = true
    this.chargePhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    // Glow pulse on the back fungi
    this.idlePhase += deltaTime
    if (this.glowMaterial) {
      const k = 0.8 + 0.2 * Math.sin(this.idlePhase * 2.2)
      this.glowMaterial.color.setHex(GLOW_TEAL).multiplyScalar(k)
    }

    // Gore: head dips then tosses up
    if (this.isCharging && this.head) {
      this.chargePhase += deltaTime * 9
      if (this.chargePhase >= Math.PI) {
        this.isCharging = false
        this.head.rotation.x = 0
      } else {
        this.head.rotation.x = Math.sin(this.chargePhase) * 0.5 - Math.sin(this.chargePhase * 2) * 0.3
      }
    }

    if (this.isWalking) {
      this.legPhase += deltaTime * (this.isAggressive ? 12 : 6)
      const swing = Math.sin(this.legPhase) * 0.5
      if (this.legs.length === 4) {
        this.legs[0].rotation.x = swing
        this.legs[1].rotation.x = -swing
        this.legs[2].rotation.x = -swing
        this.legs[3].rotation.x = swing
      }
    } else {
      for (const leg of this.legs) leg.rotation.x *= 0.85
      // Grazing: head bobs down to the mycelium
      if (!this.isCharging && this.head) {
        this.head.rotation.x = 0.35 + Math.sin(this.idlePhase * 1.3) * 0.25
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    this.glowMaterial = null
    super.dispose()
  }
}
