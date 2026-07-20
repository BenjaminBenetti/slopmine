import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { WolfPeltItem } from '../../../items/materials/wolf_pelt/WolfPeltItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Wolf colors
const WOLF_GREY = 0x8c8c8c
const WOLF_DARK_GREY = 0x5a5a5a
const WOLF_LIGHT = 0xcfcfcf // Muzzle, chest, tail tip
const WOLF_DARK = 0x1a1a1a // Eyes, nose
const EYE_AMBER = 0xd4a017 // Aggressive stare

// Wolf dimensions (in world units) - bigger and leaner than fox
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 8 * SCALE
const BODY_HEIGHT = 7 * SCALE
const BODY_DEPTH = 14 * SCALE
const HEAD_SIZE = 6 * SCALE
const SNOUT_WIDTH = 3 * SCALE
const SNOUT_HEIGHT = 2.5 * SCALE
const SNOUT_DEPTH = 3.5 * SCALE
const EAR_WIDTH = 2 * SCALE
const EAR_HEIGHT = 2.5 * SCALE
const EAR_DEPTH = 1 * SCALE
const LEG_WIDTH = 2 * SCALE
const LEG_HEIGHT = 6 * SCALE
const LEG_DEPTH = 2 * SCALE
const TAIL_WIDTH = 2.5 * SCALE
const TAIL_HEIGHT = 2.5 * SCALE
const TAIL_DEPTH = 7 * SCALE
const EYE_SIZE = 1.2 * SCALE
const NOSE_SIZE = 1 * SCALE

/**
 * A wolf - a grey forest predator that hunts the player on sight.
 *
 * Stats:
 * - 14 HP
 * - 4 damage (2 hearts)
 * - 10 block detection range
 * - 5.5 blocks/s chase speed
 * - 1.0s attack cooldown
 *
 * Drops:
 * - 1 Wolf Pelt
 */
export class WolfEntity extends AggressiveEntity {
  readonly type = 'wolf'

  // Animation state
  private legAnimPhase = 0
  private tailAnimPhase = 0
  private lungePhase = 0
  private isLunging = false

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('wolf', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 0.85, 1.1),
      // Combat stats - a moderate threat (skeleton: 20 HP / 6 dmg)
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 14,
      attackDamage: 4, // 2 hearts
      attackRange: 1.8,
      attackCooldown: 1.0,
      detectionRange: 10,
      chaseSpeed: 5.5, // Fast - hard to outrun in the trees
      walkSpeed: 2.5,
      attackKnockbackHorizontal: 4.5,
      attackKnockbackVertical: 3.0,
      // Drops
      drops: [
        { createItem: () => new WolfPeltItem(), minCount: 1, maxCount: 1 },
      ],
    })

    this.legAnimPhase = Math.random() * Math.PI * 2
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const greyMaterial = new THREE.MeshLambertMaterial({ color: WOLF_GREY })
    const darkGreyMaterial = new THREE.MeshLambertMaterial({ color: WOLF_DARK_GREY })
    const lightMaterial = new THREE.MeshLambertMaterial({ color: WOLF_LIGHT })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: WOLF_DARK })

    this.registerMaterialForLighting(greyMaterial)
    this.registerMaterialForLighting(darkGreyMaterial)
    this.registerMaterialForLighting(lightMaterial)
    this.registerMaterialForLighting(darkMaterial)

    // Body (grey)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, greyMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Dark grey back/shoulder fur
    const backGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.9, BODY_HEIGHT * 0.3, BODY_DEPTH * 0.8)
    const back = new THREE.Mesh(backGeometry, darkGreyMaterial)
    back.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.95, -BODY_DEPTH * 0.05)
    back.castShadow = true
    group.add(back)

    // Light chest
    const chestGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.7, BODY_HEIGHT * 0.4, BODY_DEPTH * 0.3)
    const chest = new THREE.Mesh(chestGeometry, lightMaterial)
    chest.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.25, BODY_DEPTH * 0.35)
    group.add(chest)

    // Head group
    const headGroup = new THREE.Group()

    // Main head (grey)
    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE)
    const headMesh = new THREE.Mesh(headGeometry, greyMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout (light grey, boxy muzzle)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, lightMaterial)
    snout.position.set(0, -HEAD_SIZE / 6, HEAD_SIZE / 2 + SNOUT_DEPTH / 2)
    snout.castShadow = true
    headGroup.add(snout)

    // Nose (dark)
    const noseGeometry = new THREE.BoxGeometry(NOSE_SIZE, NOSE_SIZE, NOSE_SIZE * 0.5)
    const nose = new THREE.Mesh(noseGeometry, darkMaterial)
    nose.position.set(0, SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2 + NOSE_SIZE * 0.25)
    snout.add(nose)

    // Ears (dark grey, upright)
    const earGeometry = new THREE.BoxGeometry(EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH)

    const leftEar = new THREE.Mesh(earGeometry, darkGreyMaterial)
    leftEar.position.set(-HEAD_SIZE / 3, HEAD_SIZE / 2 + EAR_HEIGHT / 3, -HEAD_SIZE / 6)
    leftEar.castShadow = true
    headGroup.add(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, darkGreyMaterial)
    rightEar.position.set(HEAD_SIZE / 3, HEAD_SIZE / 2 + EAR_HEIGHT / 3, -HEAD_SIZE / 6)
    rightEar.castShadow = true
    headGroup.add(rightEar)

    // Amber eyes (emissive-looking basic material for a predator stare)
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE_AMBER })
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE, EYE_SIZE * 0.7, EYE_SIZE * 0.2)

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    leftEye.position.set(-HEAD_SIZE / 4, HEAD_SIZE / 6, HEAD_SIZE / 2 + 0.01)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    rightEye.position.set(HEAD_SIZE / 4, HEAD_SIZE / 6, HEAD_SIZE / 2 + 0.01)
    headGroup.add(rightEye)

    // Position head
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2 + HEAD_SIZE / 4
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_SIZE / 3
    group.add(headGroup)
    this.head = headGroup

    // Tail (grey with light tip, hangs low when calm)
    const tailGroup = new THREE.Group()

    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tailMesh = new THREE.Mesh(tailGeometry, greyMaterial)
    tailMesh.position.z = -TAIL_DEPTH / 2
    tailMesh.castShadow = true
    tailGroup.add(tailMesh)

    const tailTipGeometry = new THREE.BoxGeometry(TAIL_WIDTH * 0.8, TAIL_HEIGHT * 0.8, TAIL_DEPTH * 0.25)
    const tailTip = new THREE.Mesh(tailTipGeometry, lightMaterial)
    tailTip.position.z = -TAIL_DEPTH - TAIL_DEPTH * 0.1
    tailTip.castShadow = true
    tailGroup.add(tailTip)

    tailGroup.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.8, -BODY_DEPTH / 2)
    tailGroup.rotation.x = 0.5 // Hangs down-back when calm
    group.add(tailGroup)
    this.tail = tailGroup

    // Legs
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const legPositions = [
      { x: BODY_WIDTH / 3, z: BODY_DEPTH / 3 }, // Front right
      { x: -BODY_WIDTH / 3, z: BODY_DEPTH / 3 }, // Front left
      { x: BODY_WIDTH / 3, z: -BODY_DEPTH / 3 }, // Back right
      { x: -BODY_WIDTH / 3, z: -BODY_DEPTH / 3 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, greyMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.castShadow = true
      leg.receiveShadow = true
      group.add(leg)
      this.legs.push(leg)
    }

    // Merge rigid same-shadow boxes; legs, head and tail animate.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, this.head, this.tail],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected performAttack(): void {
    super.performAttack()
    // Trigger a head lunge animation
    this.isLunging = true
    this.lungePhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    // Attack lunge: head snaps forward then recovers
    if (this.isLunging && this.head) {
      this.lungePhase += deltaTime * 10
      if (this.lungePhase >= Math.PI) {
        this.isLunging = false
        this.head.rotation.x = 0
      } else {
        this.head.rotation.x = -Math.sin(this.lungePhase) * 0.6
      }
    }

    if (this.isWalking) {
      // Faster leg swing while chasing
      this.legAnimPhase += deltaTime * (this.isAggressive ? 13 : 8)
      const legSwing = Math.sin(this.legAnimPhase) * 0.55

      if (this.legs.length >= 4) {
        this.legs[0].rotation.x = legSwing
        this.legs[1].rotation.x = -legSwing
        this.legs[2].rotation.x = -legSwing
        this.legs[3].rotation.x = legSwing
      }

      // Tail streams out behind while running, raised when aggressive
      if (this.tail) {
        const target = this.isAggressive ? -0.15 : 0.2
        this.tail.rotation.x += (target - this.tail.rotation.x) * 0.15
      }
    } else {
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9
      }

      // Idle tail sway; hangs low when calm, stiff and high when aggressive
      this.tailAnimPhase += deltaTime * 2
      if (this.tail) {
        const target = this.isAggressive ? -0.1 : 0.5
        this.tail.rotation.x += (target - this.tail.rotation.x) * 0.1
        this.tail.rotation.y = Math.sin(this.tailAnimPhase) * (this.isAggressive ? 0.05 : 0.15)
      }

      // Slow idle head scan when not lunging
      if (!this.isLunging && this.head) {
        this.head.rotation.x = 0
        this.head.rotation.y = Math.sin(this.tailAnimPhase * 0.6) * 0.15
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    this.tail = null
    super.dispose()
  }
}
