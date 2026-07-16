import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { BoneItem } from '../../../items/materials/bone/BoneItem.ts'
import { CorruptedEssenceItem } from '../../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Skeleton colors - dim, spooky appearance
const BONE_LIGHT = 0x8a7a64  // Dimmer bone color
const BONE_DARK = 0x5a4a3a   // Darker accents
const EYE_RED = 0xff0000

// Pixel scale (1 pixel = 0.046875 blocks) - 25% shorter than original
const SCALE = 0.046875

// Body part dimensions (in pixels, scaled)
const SKULL_SIZE = 8 * SCALE
const JAW_WIDTH = 6 * SCALE
const JAW_HEIGHT = 3 * SCALE
const JAW_DEPTH = 6 * SCALE
const EYE_SIZE = 2 * SCALE
const EYE_DEPTH = 1 * SCALE
const RIBCAGE_WIDTH = 10 * SCALE
const RIBCAGE_HEIGHT = 12 * SCALE
const RIBCAGE_DEPTH = 4 * SCALE
const ARM_SEGMENT_WIDTH = 2 * SCALE
const ARM_SEGMENT_LENGTH = 8 * SCALE
const HAND_SIZE = 4 * SCALE
const LEG_SEGMENT_WIDTH = 2 * SCALE
const LEG_UPPER_LENGTH = 10 * SCALE
const LEG_LOWER_LENGTH = 10 * SCALE
const FOOT_WIDTH = 3 * SCALE
const FOOT_HEIGHT = 2 * SCALE
const FOOT_DEPTH = 4 * SCALE

// Neck and spine dimensions
const NECK_WIDTH = 3 * SCALE
const NECK_HEIGHT = 2 * SCALE
const SPINE_WIDTH = 2 * SCALE
const SPINE_HEIGHT = 4 * SCALE

// Animation constants
const WALK_SWING_SPEED = 8.0 // radians per second
const WALK_SWING_AMPLITUDE = 0.4 // radians
const ATTACK_SWING_SPEED = 12.0 // faster attack animation
const ATTACK_SWING_AMPLITUDE = 1.2 // larger attack swing
const EYE_PULSE_SPEED = 3.0 // eye glow pulse speed
const EYE_MIN_INTENSITY = 0.3
const EYE_MAX_INTENSITY = 0.8

/**
 * A dark, spooky skeleton enemy that spawns in the Hell biome.
 * Attacks players with its bony hands.
 *
 * Stats:
 * - 20 HP
 * - 6 damage (3 hearts)
 * - 2.5 block attack range
 * - 1.2s attack cooldown
 * - 20 block detection range
 * - 4.5 blocks/s chase speed
 *
 * Drops:
 * - 1-3 Bones
 * - 0-1 Corrupted Essence
 */
export class SkeletonEntity extends AggressiveEntity {
  readonly type = 'skeleton'

  // Animation state
  private walkPhase = 0
  private attackPhase = 0
  private isAttacking = false
  private eyePulsePhase = 0

  // Mesh part references for animation
  private leftUpperArm: THREE.Group | null = null
  private rightUpperArm: THREE.Group | null = null
  private leftUpperLeg: THREE.Group | null = null
  private rightUpperLeg: THREE.Group | null = null
  private jaw: THREE.Mesh | null = null
  private leftEye: THREE.Mesh | null = null
  private rightEye: THREE.Mesh | null = null
  private eyeMaterial: THREE.MeshLambertMaterial | null = null

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('skeleton', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.5, 1.35, 0.5),
      // Combat stats
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: 20,
      attackDamage: 6, // 3 hearts
      attackRange: 2.5,
      attackCooldown: 1.2,
      detectionRange: 20,
      chaseSpeed: 4.5,
      walkSpeed: 2.0,
      // Knockback
      attackKnockbackHorizontal: 5.0,
      attackKnockbackVertical: 3.5,
      // Drops
      drops: [
        { createItem: () => new BoneItem(), minCount: 1, maxCount: 3 },
        { createItem: () => new CorruptedEssenceItem(), minCount: 0, maxCount: 1 },
      ],
    })

    // Randomize initial animation phase
    this.walkPhase = Math.random() * Math.PI * 2
    this.eyePulsePhase = Math.random() * Math.PI * 2
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Materials
    const boneLightMaterial = new THREE.MeshLambertMaterial({ color: BONE_LIGHT })
    const boneDarkMaterial = new THREE.MeshLambertMaterial({ color: BONE_DARK })
    this.eyeMaterial = new THREE.MeshLambertMaterial({
      color: EYE_RED,
      emissive: new THREE.Color(EYE_RED),
      emissiveIntensity: 1.0,
    })

    // Register bone materials for light-based dimming
    // Note: Eye material is NOT registered - it should glow in the dark
    this.registerMaterialForLighting(boneLightMaterial)
    this.registerMaterialForLighting(boneDarkMaterial)

    // Calculate heights for positioning
    const footHeight = FOOT_HEIGHT
    const lowerLegTop = footHeight + LEG_LOWER_LENGTH
    const upperLegTop = lowerLegTop + LEG_UPPER_LENGTH
    const pelvisHeight = upperLegTop
    const ribcageBottom = pelvisHeight + SPINE_HEIGHT
    const ribcageTop = ribcageBottom + RIBCAGE_HEIGHT
    const neckTop = ribcageTop + NECK_HEIGHT
    const skullCenter = neckTop + SKULL_SIZE / 2

    // ===== SKULL =====
    const skullGeometry = new THREE.BoxGeometry(SKULL_SIZE, SKULL_SIZE, SKULL_SIZE)
    const skull = new THREE.Mesh(skullGeometry, boneLightMaterial)
    skull.position.set(0, skullCenter, 0)
    skull.castShadow = true
    group.add(skull)

    // Eye sockets (dark indentations)
    const eyeSocketGeometry = new THREE.BoxGeometry(EYE_SIZE * 1.2, EYE_SIZE * 1.2, EYE_DEPTH)
    for (const xMult of [-1, 1]) {
      const socket = new THREE.Mesh(eyeSocketGeometry, boneDarkMaterial)
      socket.position.set(
        xMult * SKULL_SIZE * 0.25,
        skullCenter + SKULL_SIZE * 0.1,
        SKULL_SIZE / 2 - EYE_DEPTH / 2
      )
      group.add(socket)
    }

    // Eyes (glowing red)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE, EYE_SIZE, EYE_DEPTH)
    this.leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial)
    this.leftEye.position.set(
      -SKULL_SIZE * 0.25,
      skullCenter + SKULL_SIZE * 0.1,
      SKULL_SIZE / 2 + 0.01
    )
    group.add(this.leftEye)

    this.rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial)
    this.rightEye.position.set(
      SKULL_SIZE * 0.25,
      skullCenter + SKULL_SIZE * 0.1,
      SKULL_SIZE / 2 + 0.01
    )
    group.add(this.rightEye)

    // Jaw (animated)
    const jawGeometry = new THREE.BoxGeometry(JAW_WIDTH, JAW_HEIGHT, JAW_DEPTH)
    this.jaw = new THREE.Mesh(jawGeometry, boneLightMaterial)
    this.jaw.position.set(0, skullCenter - SKULL_SIZE / 2, 0)
    this.jaw.castShadow = true
    group.add(this.jaw)

    // ===== NECK =====
    const neckGeometry = new THREE.BoxGeometry(NECK_WIDTH, NECK_HEIGHT, NECK_WIDTH)
    const neck = new THREE.Mesh(neckGeometry, boneLightMaterial)
    neck.position.set(0, ribcageTop + NECK_HEIGHT / 2, 0)
    neck.castShadow = true
    group.add(neck)

    // ===== RIBCAGE =====
    // Spine (vertical backbone through the ribcage)
    const ribSpineHeight = RIBCAGE_HEIGHT
    const ribSpineGeometry = new THREE.BoxGeometry(SPINE_WIDTH, ribSpineHeight, SPINE_WIDTH)
    const ribSpine = new THREE.Mesh(ribSpineGeometry, boneLightMaterial)
    ribSpine.position.set(0, ribcageBottom + ribSpineHeight / 2, -RIBCAGE_DEPTH / 2 + SPINE_WIDTH / 2)
    ribSpine.castShadow = true
    group.add(ribSpine)

    // Individual ribs curving from spine to front (4 pairs of ribs with gaps)
    const ribThickness = 1.5 * SCALE
    const ribDepth = RIBCAGE_DEPTH - SPINE_WIDTH / 2
    const numRibs = 4
    const ribSpacing = RIBCAGE_HEIGHT / (numRibs + 1)

    for (let i = 0; i < numRibs; i++) {
      const ribY = ribcageBottom + ribSpacing * (i + 1)

      // Left and right rib for each level
      for (const xMult of [-1, 1]) {
        // Rib connects from spine (back) curving around to front
        // Back segment (horizontal from spine)
        const backSegmentWidth = RIBCAGE_WIDTH / 2 - SPINE_WIDTH / 2
        const backSegmentGeometry = new THREE.BoxGeometry(backSegmentWidth, ribThickness, ribThickness)
        const backSegment = new THREE.Mesh(backSegmentGeometry, boneLightMaterial)
        backSegment.position.set(
          xMult * (SPINE_WIDTH / 2 + backSegmentWidth / 2),
          ribY,
          -RIBCAGE_DEPTH / 2 + SPINE_WIDTH / 2
        )
        backSegment.castShadow = true
        group.add(backSegment)

        // Side segment (curves forward along the side)
        const sideSegmentGeometry = new THREE.BoxGeometry(ribThickness, ribThickness, ribDepth)
        const sideSegment = new THREE.Mesh(sideSegmentGeometry, boneLightMaterial)
        sideSegment.position.set(
          xMult * (RIBCAGE_WIDTH / 2 - ribThickness / 2),
          ribY,
          0
        )
        sideSegment.castShadow = true
        group.add(sideSegment)

        // Front segment (curves toward center at front)
        const frontSegmentWidth = RIBCAGE_WIDTH / 2 - ribThickness - SPINE_WIDTH
        const frontSegmentGeometry = new THREE.BoxGeometry(frontSegmentWidth, ribThickness, ribThickness)
        const frontSegment = new THREE.Mesh(frontSegmentGeometry, boneLightMaterial)
        frontSegment.position.set(
          xMult * (SPINE_WIDTH + frontSegmentWidth / 2),
          ribY,
          RIBCAGE_DEPTH / 2 - ribThickness / 2
        )
        frontSegment.castShadow = true
        group.add(frontSegment)
      }
    }

    // Sternum (front center bone connecting the ribs)
    const sternumGeometry = new THREE.BoxGeometry(SPINE_WIDTH, RIBCAGE_HEIGHT * 0.7, ribThickness)
    const sternum = new THREE.Mesh(sternumGeometry, boneLightMaterial)
    sternum.position.set(0, ribcageBottom + RIBCAGE_HEIGHT * 0.5, RIBCAGE_DEPTH / 2 - ribThickness / 2)
    sternum.castShadow = true
    group.add(sternum)

    // ===== SPINE =====
    const spineGeometry = new THREE.BoxGeometry(SPINE_WIDTH, SPINE_HEIGHT, SPINE_WIDTH)
    const spine = new THREE.Mesh(spineGeometry, boneLightMaterial)
    spine.position.set(0, pelvisHeight + SPINE_HEIGHT / 2, 0)
    spine.castShadow = true
    group.add(spine)

    // ===== ARMS =====
    const armSegmentGeometry = new THREE.BoxGeometry(ARM_SEGMENT_WIDTH, ARM_SEGMENT_LENGTH, ARM_SEGMENT_WIDTH)
    const handGeometry = new THREE.BoxGeometry(HAND_SIZE, HAND_SIZE, ARM_SEGMENT_WIDTH)

    // Left arm
    this.leftUpperArm = new THREE.Group()
    this.leftUpperArm.position.set(-RIBCAGE_WIDTH / 2 - ARM_SEGMENT_WIDTH / 2, ribcageTop - ARM_SEGMENT_WIDTH, 0)

    const leftUpper = new THREE.Mesh(armSegmentGeometry, boneLightMaterial)
    leftUpper.position.set(0, -ARM_SEGMENT_LENGTH / 2, 0)
    leftUpper.castShadow = true
    this.leftUpperArm.add(leftUpper)

    const leftLowerArm = new THREE.Mesh(armSegmentGeometry, boneLightMaterial)
    leftLowerArm.position.set(0, -ARM_SEGMENT_LENGTH - ARM_SEGMENT_LENGTH / 2, 0)
    leftLowerArm.castShadow = true
    this.leftUpperArm.add(leftLowerArm)

    const leftHand = new THREE.Mesh(handGeometry, boneDarkMaterial)
    leftHand.position.set(0, -ARM_SEGMENT_LENGTH * 2 - HAND_SIZE / 2, 0)
    leftHand.castShadow = true
    this.leftUpperArm.add(leftHand)

    group.add(this.leftUpperArm)

    // Right arm
    this.rightUpperArm = new THREE.Group()
    this.rightUpperArm.position.set(RIBCAGE_WIDTH / 2 + ARM_SEGMENT_WIDTH / 2, ribcageTop - ARM_SEGMENT_WIDTH, 0)

    const rightUpper = new THREE.Mesh(armSegmentGeometry, boneLightMaterial)
    rightUpper.position.set(0, -ARM_SEGMENT_LENGTH / 2, 0)
    rightUpper.castShadow = true
    this.rightUpperArm.add(rightUpper)

    const rightLowerArm = new THREE.Mesh(armSegmentGeometry, boneLightMaterial)
    rightLowerArm.position.set(0, -ARM_SEGMENT_LENGTH - ARM_SEGMENT_LENGTH / 2, 0)
    rightLowerArm.castShadow = true
    this.rightUpperArm.add(rightLowerArm)

    const rightHand = new THREE.Mesh(handGeometry, boneDarkMaterial)
    rightHand.position.set(0, -ARM_SEGMENT_LENGTH * 2 - HAND_SIZE / 2, 0)
    rightHand.castShadow = true
    this.rightUpperArm.add(rightHand)

    group.add(this.rightUpperArm)

    // ===== LEGS =====
    const legUpperGeometry = new THREE.BoxGeometry(LEG_SEGMENT_WIDTH, LEG_UPPER_LENGTH, LEG_SEGMENT_WIDTH)
    const legLowerGeometry = new THREE.BoxGeometry(LEG_SEGMENT_WIDTH, LEG_LOWER_LENGTH, LEG_SEGMENT_WIDTH)
    const footGeometry = new THREE.BoxGeometry(FOOT_WIDTH, FOOT_HEIGHT, FOOT_DEPTH)

    // Left leg
    this.leftUpperLeg = new THREE.Group()
    this.leftUpperLeg.position.set(-SPINE_WIDTH * 1.5, pelvisHeight, 0)

    const leftUpperLegMesh = new THREE.Mesh(legUpperGeometry, boneLightMaterial)
    leftUpperLegMesh.position.set(0, -LEG_UPPER_LENGTH / 2, 0)
    leftUpperLegMesh.castShadow = true
    this.leftUpperLeg.add(leftUpperLegMesh)

    const leftLowerLeg = new THREE.Mesh(legLowerGeometry, boneLightMaterial)
    leftLowerLeg.position.set(0, -LEG_UPPER_LENGTH - LEG_LOWER_LENGTH / 2, 0)
    leftLowerLeg.castShadow = true
    this.leftUpperLeg.add(leftLowerLeg)

    const leftFoot = new THREE.Mesh(footGeometry, boneDarkMaterial)
    leftFoot.position.set(0, -LEG_UPPER_LENGTH - LEG_LOWER_LENGTH - FOOT_HEIGHT / 2, FOOT_DEPTH / 4)
    leftFoot.castShadow = true
    this.leftUpperLeg.add(leftFoot)

    group.add(this.leftUpperLeg)

    // Right leg
    this.rightUpperLeg = new THREE.Group()
    this.rightUpperLeg.position.set(SPINE_WIDTH * 1.5, pelvisHeight, 0)

    const rightUpperLegMesh = new THREE.Mesh(legUpperGeometry, boneLightMaterial)
    rightUpperLegMesh.position.set(0, -LEG_UPPER_LENGTH / 2, 0)
    rightUpperLegMesh.castShadow = true
    this.rightUpperLeg.add(rightUpperLegMesh)

    const rightLowerLeg = new THREE.Mesh(legLowerGeometry, boneLightMaterial)
    rightLowerLeg.position.set(0, -LEG_UPPER_LENGTH - LEG_LOWER_LENGTH / 2, 0)
    rightLowerLeg.castShadow = true
    this.rightUpperLeg.add(rightLowerLeg)

    const rightFoot = new THREE.Mesh(footGeometry, boneDarkMaterial)
    rightFoot.position.set(0, -LEG_UPPER_LENGTH - LEG_LOWER_LENGTH - FOOT_HEIGHT / 2, FOOT_DEPTH / 4)
    rightFoot.castShadow = true
    this.rightUpperLeg.add(rightFoot)

    group.add(this.rightUpperLeg)

    // Merge the rigid bone boxes (skull, ribcage, spine) into a couple of meshes
    // and each limb's segments into one; freeze the rest. Arms, legs and jaw
    // animate; the eyes are emissive so they are left as separate glowing meshes.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [
        this.leftUpperArm,
        this.rightUpperArm,
        this.leftUpperLeg,
        this.rightUpperLeg,
        this.jaw,
      ],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  /**
   * Override performAttack to trigger attack animation.
   */
  protected override performAttack(): void {
    super.performAttack()
    this.isAttacking = true
    this.attackPhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    // Update eye pulse
    this.eyePulsePhase += deltaTime * EYE_PULSE_SPEED
    if (this.eyeMaterial) {
      const intensity = EYE_MIN_INTENSITY + (EYE_MAX_INTENSITY - EYE_MIN_INTENSITY) *
        (0.5 + 0.5 * Math.sin(this.eyePulsePhase))
      this.eyeMaterial.emissiveIntensity = intensity
    }

    // Handle attack animation - overhead chop
    if (this.isAttacking) {
      this.attackPhase += deltaTime * ATTACK_SWING_SPEED

      // Arms swing from raised overhead down in a chopping motion
      // Progress goes from 0 to 1 over the animation
      const progress = Math.min(this.attackPhase / Math.PI, 1.0)

      // Ease-out curve for quick powerful downswing
      const easedProgress = 1 - Math.pow(1 - progress, 3)

      // Start with arms raised way back over head (-2.8 rad ≈ pointing up/back)
      // End with arms swung forward past horizontal (+0.6 rad)
      const startAngle = -2.8
      const endAngle = 0.6
      const attackSwing = startAngle + easedProgress * (endAngle - startAngle)

      if (this.leftUpperArm) {
        this.leftUpperArm.rotation.x = attackSwing
      }
      if (this.rightUpperArm) {
        this.rightUpperArm.rotation.x = attackSwing
      }

      // Jaw opens wide during the downswing
      if (this.jaw) {
        const jawOpen = Math.sin(progress * Math.PI) * 0.4
        this.jaw.rotation.x = jawOpen
      }

      // Attack animation complete
      if (this.attackPhase >= Math.PI) {
        this.isAttacking = false
        this.attackPhase = 0
        if (this.jaw) {
          this.jaw.rotation.x = 0
        }
      }

      return // Skip walking animation during attack
    }

    // Walking animation
    if (this.isWalking) {
      this.walkPhase += deltaTime * WALK_SWING_SPEED
      const legSwing = Math.sin(this.walkPhase) * WALK_SWING_AMPLITUDE
      const armSwing = Math.sin(this.walkPhase) * WALK_SWING_AMPLITUDE * 0.5

      // Legs swing opposite to each other
      if (this.leftUpperLeg) {
        this.leftUpperLeg.rotation.x = legSwing
      }
      if (this.rightUpperLeg) {
        this.rightUpperLeg.rotation.x = -legSwing
      }

      // Arms swing opposite to legs (natural walking motion)
      if (this.leftUpperArm) {
        this.leftUpperArm.rotation.x = -armSwing
      }
      if (this.rightUpperArm) {
        this.rightUpperArm.rotation.x = armSwing
      }
    } else {
      // Reset to neutral pose when not walking
      if (this.leftUpperLeg) {
        this.leftUpperLeg.rotation.x = 0
      }
      if (this.rightUpperLeg) {
        this.rightUpperLeg.rotation.x = 0
      }
      if (this.leftUpperArm) {
        this.leftUpperArm.rotation.x = 0
      }
      if (this.rightUpperArm) {
        this.rightUpperArm.rotation.x = 0
      }
    }
  }

  dispose(): void {
    this.leftUpperArm = null
    this.rightUpperArm = null
    this.leftUpperLeg = null
    this.rightUpperLeg = null
    this.jaw = null
    this.leftEye = null
    this.rightEye = null
    this.eyeMaterial = null
    super.dispose()
  }
}
