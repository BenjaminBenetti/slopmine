import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawFoxMeatItem } from '../../../items/food/raw_fox_meat/RawFoxMeatItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Fox colors
const FOX_ORANGE = 0xd35400
const FOX_WHITE = 0xffffff
const FOX_DARK = 0x1a1a1a // Dark color for eyes/nose

// Fox dimensions (in world units) - smaller than pig
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 8 * SCALE
const BODY_HEIGHT = 6 * SCALE
const BODY_DEPTH = 12 * SCALE
const HEAD_SIZE = 5 * SCALE
const LEG_WIDTH = 2 * SCALE
const LEG_HEIGHT = 4 * SCALE
const LEG_DEPTH = 2 * SCALE
const EAR_WIDTH = 1.5 * SCALE
const EAR_HEIGHT = 3 * SCALE
const EAR_DEPTH = 1 * SCALE
const TAIL_WIDTH = 3 * SCALE
const TAIL_HEIGHT = 3 * SCALE
const TAIL_DEPTH = 6 * SCALE
const SNOUT_WIDTH = 2.5 * SCALE
const SNOUT_HEIGHT = 2 * SCALE
const SNOUT_DEPTH = 2 * SCALE
const EYE_SIZE = 1.2 * SCALE
const NOSE_SIZE = 0.8 * SCALE

/**
 * A fox entity - a faster, rarer version of pigs.
 */
export class FoxEntity extends PeacefulEntity {
  readonly type = 'fox'

  // Animation state
  private legAnimPhase = 0
  private tailAnimPhase = 0
  private headBobPhase = 0

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null

  constructor(config: IPeacefulEntityConfig) {
    super('fox', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.7, 0.8, 0.9),
      // Fox is faster than pig
      walkSpeed: 3.0, // Pig is 2.0
      fleeSpeed: 6.0, // Pig is 4.0
      // Slightly less health than pig
      maxHealth: 8,
      drops: [
        { createItem: () => new RawFoxMeatItem(), minCount: 1, maxCount: 2 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Create materials
    const orangeMaterial = new THREE.MeshLambertMaterial({ color: FOX_ORANGE })
    const whiteMaterial = new THREE.MeshLambertMaterial({ color: FOX_WHITE })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: FOX_DARK })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(orangeMaterial)
    this.registerMaterialForLighting(whiteMaterial)
    this.registerMaterialForLighting(darkMaterial)

    // Body (orange)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, orangeMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // White chest/belly (front underside of body)
    const chestGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.8, BODY_HEIGHT * 0.4, BODY_DEPTH * 0.4)
    const chest = new THREE.Mesh(chestGeometry, whiteMaterial)
    chest.position.set(0, LEG_HEIGHT + BODY_HEIGHT * 0.2, BODY_DEPTH * 0.25)
    chest.castShadow = true
    group.add(chest)

    // Head group
    const headGroup = new THREE.Group()

    // Main head (orange)
    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE)
    const headMesh = new THREE.Mesh(headGeometry, orangeMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout (white, pointed)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, whiteMaterial)
    snout.position.z = HEAD_SIZE / 2 + SNOUT_DEPTH / 2
    snout.position.y = -HEAD_SIZE / 6
    snout.castShadow = true
    headGroup.add(snout)

    // Nose (dark, on tip of snout)
    const noseGeometry = new THREE.BoxGeometry(NOSE_SIZE, NOSE_SIZE, NOSE_SIZE * 0.5)
    const nose = new THREE.Mesh(noseGeometry, darkMaterial)
    nose.position.set(0, SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2 + NOSE_SIZE * 0.25)
    snout.add(nose)

    // Ears (tall, pointy, orange) - using tapered boxes
    const earGeometry = new THREE.BoxGeometry(EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH)

    const leftEar = new THREE.Mesh(earGeometry, orangeMaterial)
    leftEar.position.set(-HEAD_SIZE / 3, HEAD_SIZE / 2 + EAR_HEIGHT / 3, -HEAD_SIZE / 6)
    leftEar.rotation.x = -0.15 // Tilt slightly back
    leftEar.castShadow = true
    headGroup.add(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, orangeMaterial)
    rightEar.position.set(HEAD_SIZE / 3, HEAD_SIZE / 2 + EAR_HEIGHT / 3, -HEAD_SIZE / 6)
    rightEar.rotation.x = -0.15
    rightEar.castShadow = true
    headGroup.add(rightEar)

    // Inner ears (white)
    const innerEarGeometry = new THREE.BoxGeometry(EAR_WIDTH * 0.5, EAR_HEIGHT * 0.6, EAR_DEPTH * 0.5)

    const leftInnerEar = new THREE.Mesh(innerEarGeometry, whiteMaterial)
    leftInnerEar.position.set(0, 0, EAR_DEPTH / 2)
    leftEar.add(leftInnerEar)

    const rightInnerEar = new THREE.Mesh(innerEarGeometry, whiteMaterial)
    rightInnerEar.position.set(0, 0, EAR_DEPTH / 2)
    rightEar.add(rightInnerEar)

    // Eyes (dark with white highlights)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.6, EYE_SIZE * 0.8, EYE_SIZE * 0.2)

    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_SIZE / 4, HEAD_SIZE / 6, HEAD_SIZE / 2 + 0.01)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_SIZE / 4, HEAD_SIZE / 6, HEAD_SIZE / 2 + 0.01)
    headGroup.add(rightEye)

    // Eye highlights (white sparkles)
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const highlightGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.2, EYE_SIZE * 0.2, EYE_SIZE * 0.1)

    const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    leftHighlight.position.set(-HEAD_SIZE / 4 + EYE_SIZE * 0.1, HEAD_SIZE / 6 + EYE_SIZE * 0.15, HEAD_SIZE / 2 + 0.02)
    headGroup.add(leftHighlight)

    const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    rightHighlight.position.set(HEAD_SIZE / 4 + EYE_SIZE * 0.1, HEAD_SIZE / 6 + EYE_SIZE * 0.15, HEAD_SIZE / 2 + 0.02)
    headGroup.add(rightHighlight)

    // Position head
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2 + HEAD_SIZE / 4
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_SIZE / 3
    group.add(headGroup)
    this.head = headGroup

    // Tail group (bushy, orange with white tip)
    const tailGroup = new THREE.Group()

    // Main tail (orange)
    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tailMesh = new THREE.Mesh(tailGeometry, orangeMaterial)
    tailMesh.castShadow = true
    tailMesh.receiveShadow = true
    tailGroup.add(tailMesh)

    // Tail tip (white)
    const tailTipGeometry = new THREE.BoxGeometry(TAIL_WIDTH * 0.8, TAIL_HEIGHT * 0.8, TAIL_DEPTH * 0.3)
    const tailTip = new THREE.Mesh(tailTipGeometry, whiteMaterial)
    tailTip.position.z = -TAIL_DEPTH / 2 - TAIL_DEPTH * 0.15
    tailTip.castShadow = true
    tailGroup.add(tailTip)

    // Position and angle tail
    tailGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2 + TAIL_HEIGHT / 4
    tailGroup.position.z = -BODY_DEPTH / 2 - TAIL_DEPTH / 3
    tailGroup.rotation.x = -0.4 // Angle tail upward
    group.add(tailGroup)
    this.tail = tailGroup

    // Legs (4 legs, thinner than pig)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const legPositions = [
      { x: BODY_WIDTH / 3, z: BODY_DEPTH / 3 }, // Front right
      { x: -BODY_WIDTH / 3, z: BODY_DEPTH / 3 }, // Front left
      { x: BODY_WIDTH / 3, z: -BODY_DEPTH / 3 }, // Back right
      { x: -BODY_WIDTH / 3, z: -BODY_DEPTH / 3 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, orangeMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.castShadow = true
      leg.receiveShadow = true
      group.add(leg)
      this.legs.push(leg)
    }

    // Merge rigid same-shadow boxes and freeze static nodes. Legs, head and tail
    // animate; the MeshBasic eye highlights are left as-is.
    optimizeEntityMesh(group, {
      merge: true,
      dynamic: [...this.legs, this.head, this.tail],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    return group
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.isWalking) {
      // Leg animation while walking (faster than pig since fox moves faster)
      this.legAnimPhase += deltaTime * 10 // Faster leg movement
      const legSwing = Math.sin(this.legAnimPhase) * 0.5

      // Front legs swing opposite to back legs
      if (this.legs.length >= 4) {
        this.legs[0].rotation.x = legSwing // Front right
        this.legs[1].rotation.x = -legSwing // Front left
        this.legs[2].rotation.x = -legSwing // Back right
        this.legs[3].rotation.x = legSwing // Back left
      }

      // Tail wag while running
      this.tailAnimPhase += deltaTime * 6
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailAnimPhase) * 0.3
      }
    } else {
      // Reset legs when standing
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9 // Smoothly return to neutral
      }

      // Gentle tail sway while idle
      this.tailAnimPhase += deltaTime * 2
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailAnimPhase) * 0.1
      }

      // Head bob while idle
      this.headBobPhase += deltaTime * 2
      if (this.head) {
        this.head.rotation.x = Math.sin(this.headBobPhase) * 0.04
        this.head.rotation.z = Math.sin(this.headBobPhase * 0.7) * 0.02
      }
    }
  }

  dispose(): void {
    // Clear references
    this.legs = []
    this.head = null
    this.tail = null
    super.dispose()
  }
}
