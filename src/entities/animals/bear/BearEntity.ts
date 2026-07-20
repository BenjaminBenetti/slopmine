import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { BearPeltItem } from '../../../items/materials/bear_pelt/BearPeltItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Bear colors
const BEAR_BROWN = 0x6b4a2f
const BEAR_DARK_BROWN = 0x4a3220
const BEAR_MUZZLE = 0x9c7a55
const BEAR_DARK = 0x1a1a1a // Eyes, nose, claws

// Bear dimensions (in world units) - the biggest land animal in the forest
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 14 * SCALE
const BODY_HEIGHT = 12 * SCALE
const BODY_DEPTH = 20 * SCALE
const SHOULDER_WIDTH = 12 * SCALE
const SHOULDER_HEIGHT = 5 * SCALE
const SHOULDER_DEPTH = 8 * SCALE
const HEAD_WIDTH = 8 * SCALE
const HEAD_HEIGHT = 7 * SCALE
const HEAD_DEPTH = 7 * SCALE
const SNOUT_WIDTH = 4 * SCALE
const SNOUT_HEIGHT = 3 * SCALE
const SNOUT_DEPTH = 3 * SCALE
const EAR_SIZE = 2 * SCALE
const LEG_WIDTH = 4 * SCALE
const LEG_HEIGHT = 7 * SCALE
const LEG_DEPTH = 4.5 * SCALE
const PAW_HEIGHT = 1.5 * SCALE
const TAIL_SIZE = 2.5 * SCALE
const EYE_SIZE = 1.2 * SCALE
const NOSE_SIZE = 1.5 * SCALE

/**
 * A bear - a huge, slow forest predator with a short temper at close range.
 * It ignores the player unless approached (~5 blocks) or provoked, then hits
 * extremely hard.
 *
 * Stats:
 * - 42 HP (~3x wolf)
 * - 9 damage (4.5 hearts)
 * - 5 block detection range (only if you get close)
 * - 3.5 blocks/s chase speed (slow - you can outrun it)
 * - 1.8s attack cooldown, heavy knockback
 *
 * Drops:
 * - 2-3 Bear Pelts
 */
export class BearEntity extends AggressiveEntity {
  readonly type = 'bear'

  // Animation state
  private legAnimPhase = 0
  private idlePhase = 0
  private swipePhase = 0
  private isSwiping = false

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('bear', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.2, 1.4, 1.8),
      // Combat stats - tank with heavy hits but a tiny aggro bubble
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 42, // ~3x wolf (14)
      attackDamage: 9, // 4.5 hearts - do not hug the bear
      attackRange: 2.2,
      attackCooldown: 1.8,
      detectionRange: 5, // Only aggressive if you get close
      chaseSpeed: 3.5, // Lumbering - sprinting players escape
      walkSpeed: 1.2,
      jumpVelocity: 7.0, // Heavy, barely clears a block
      attackKnockbackHorizontal: 8.0, // A swat sends you flying
      attackKnockbackVertical: 5.0,
      knockbackHorizontal: 3.0, // Barely budges when hit
      knockbackVertical: 3.0,
      aggroTimeout: 8.0, // Holds a grudge a while once angered
      // Drops
      drops: [
        { createItem: () => new BearPeltItem(), minCount: 2, maxCount: 3 },
      ],
    })

    this.legAnimPhase = Math.random() * Math.PI * 2
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const brownMaterial = new THREE.MeshLambertMaterial({ color: BEAR_BROWN })
    const darkBrownMaterial = new THREE.MeshLambertMaterial({ color: BEAR_DARK_BROWN })
    const muzzleMaterial = new THREE.MeshLambertMaterial({ color: BEAR_MUZZLE })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: BEAR_DARK })

    this.registerMaterialForLighting(brownMaterial)
    this.registerMaterialForLighting(darkBrownMaterial)
    this.registerMaterialForLighting(muzzleMaterial)
    this.registerMaterialForLighting(darkMaterial)

    // Body (massive brown barrel)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, brownMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Shoulder hump (dark brown, the classic bear silhouette)
    const humpGeometry = new THREE.BoxGeometry(SHOULDER_WIDTH, SHOULDER_HEIGHT, SHOULDER_DEPTH)
    const hump = new THREE.Mesh(humpGeometry, darkBrownMaterial)
    hump.position.set(0, LEG_HEIGHT + BODY_HEIGHT + SHOULDER_HEIGHT / 2 - SHOULDER_HEIGHT * 0.3, BODY_DEPTH * 0.15)
    hump.castShadow = true
    group.add(hump)

    // Head group
    const headGroup = new THREE.Group()

    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, brownMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Muzzle (lighter brown)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, muzzleMaterial)
    snout.position.set(0, -HEAD_HEIGHT / 5, HEAD_DEPTH / 2 + SNOUT_DEPTH / 2)
    snout.castShadow = true
    headGroup.add(snout)

    // Nose (dark)
    const noseGeometry = new THREE.BoxGeometry(NOSE_SIZE, NOSE_SIZE * 0.8, NOSE_SIZE * 0.4)
    const nose = new THREE.Mesh(noseGeometry, darkMaterial)
    nose.position.set(0, SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2 + NOSE_SIZE * 0.2)
    snout.add(nose)

    // Small round ears
    const earGeometry = new THREE.BoxGeometry(EAR_SIZE, EAR_SIZE, EAR_SIZE * 0.6)

    const leftEar = new THREE.Mesh(earGeometry, darkBrownMaterial)
    leftEar.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EAR_SIZE / 3, -HEAD_DEPTH / 6)
    leftEar.castShadow = true
    headGroup.add(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, darkBrownMaterial)
    rightEar.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EAR_SIZE / 3, -HEAD_DEPTH / 6)
    rightEar.castShadow = true
    headGroup.add(rightEar)

    // Small dark eyes
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE, EYE_SIZE, EYE_SIZE * 0.2)

    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 4, HEAD_HEIGHT / 8, HEAD_DEPTH / 2 + 0.01)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 4, HEAD_HEIGHT / 8, HEAD_DEPTH / 2 + 0.01)
    headGroup.add(rightEye)

    // Position head low and forward (bears carry the head below the hump)
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT * 0.7
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_DEPTH / 3
    group.add(headGroup)
    this.head = headGroup

    // Stubby tail
    const tailGeometry = new THREE.BoxGeometry(TAIL_SIZE, TAIL_SIZE, TAIL_SIZE * 0.8)
    const tail = new THREE.Mesh(tailGeometry, darkBrownMaterial)
    tail.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.75, -BODY_DEPTH / 2 - TAIL_SIZE * 0.2)
    tail.castShadow = true
    group.add(tail)

    // Legs (thick pillars with dark paws)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const pawGeometry = new THREE.BoxGeometry(LEG_WIDTH * 1.15, PAW_HEIGHT, LEG_DEPTH * 1.2)
    const legPositions = [
      { x: BODY_WIDTH / 2 - LEG_WIDTH / 2, z: BODY_DEPTH / 2 - LEG_DEPTH / 2 }, // Front right
      { x: -BODY_WIDTH / 2 + LEG_WIDTH / 2, z: BODY_DEPTH / 2 - LEG_DEPTH / 2 }, // Front left
      { x: BODY_WIDTH / 2 - LEG_WIDTH / 2, z: -BODY_DEPTH / 2 + LEG_DEPTH / 2 }, // Back right
      { x: -BODY_WIDTH / 2 + LEG_WIDTH / 2, z: -BODY_DEPTH / 2 + LEG_DEPTH / 2 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, brownMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.castShadow = true
      leg.receiveShadow = true

      const paw = new THREE.Mesh(pawGeometry, darkMaterial)
      paw.position.y = -LEG_HEIGHT / 2 + PAW_HEIGHT / 2
      paw.castShadow = true
      leg.add(paw)

      group.add(leg)
      this.legs.push(leg)
    }

    // Merge rigid same-shadow boxes; legs and head animate.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, this.head],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected performAttack(): void {
    super.performAttack()
    // Trigger the paw-swipe head animation
    this.isSwiping = true
    this.swipePhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    // Attack swipe: head/shoulders swing sideways in a heavy arc
    if (this.isSwiping && this.head) {
      this.swipePhase += deltaTime * 7
      if (this.swipePhase >= Math.PI) {
        this.isSwiping = false
        this.head.rotation.z = 0
        this.head.rotation.x = 0
      } else {
        this.head.rotation.z = Math.sin(this.swipePhase) * 0.5
        this.head.rotation.x = -Math.sin(this.swipePhase) * 0.3
      }
    }

    if (this.isWalking) {
      // Slow, ponderous stride with a lateral body waddle feel
      this.legAnimPhase += deltaTime * (this.isAggressive ? 8 : 4)
      const legSwing = Math.sin(this.legAnimPhase) * 0.4

      if (this.legs.length >= 4) {
        this.legs[0].rotation.x = legSwing
        this.legs[1].rotation.x = -legSwing
        this.legs[2].rotation.x = -legSwing
        this.legs[3].rotation.x = legSwing
      }

      // Head sways with the stride when not mid-swipe
      if (!this.isSwiping && this.head) {
        this.head.rotation.z = Math.sin(this.legAnimPhase * 0.5) * 0.06
      }
    } else {
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9
      }

      // Idle: slow sniffing - head dips and lifts
      this.idlePhase += deltaTime * 1.2
      if (!this.isSwiping && this.head) {
        this.head.rotation.x = Math.max(0, Math.sin(this.idlePhase)) * 0.25
        this.head.rotation.z *= 0.9
        this.head.rotation.y = Math.sin(this.idlePhase * 0.4) * 0.1
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    super.dispose()
  }
}
