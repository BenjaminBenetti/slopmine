import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawBeefItem } from '../../../items/food/raw_beef/RawBeefItem.ts'

// Import cow texture
import cowTextureUrl from './assets/cow-texture.webp'

// Cow colors
const COW_BROWN = 0x8b4513 // Saddle brown
const COW_WHITE = 0xffffff // White patches
const COW_DARK = 0x1a1a1a // Dark color for eyes/nostrils
const COW_SNOUT = 0xd4a574 // Lighter tan for snout
const COW_HORN = 0xf5f5dc // Beige for horns
const COW_UDDER = 0xffb6c1 // Light pink for udder

// Cow dimensions (in world units) - bigger, more cow-like proportions
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 18 * SCALE   // Wide body
const BODY_HEIGHT = 16 * SCALE  // Tall body
const BODY_DEPTH = 32 * SCALE   // Long body (2 blocks long)
const HEAD_WIDTH = 10 * SCALE   // Big square head
const HEAD_HEIGHT = 10 * SCALE
const HEAD_DEPTH = 8 * SCALE
const LEG_WIDTH = 5 * SCALE     // Thicker legs
const LEG_HEIGHT = 12 * SCALE   // Longer legs
const LEG_DEPTH = 5 * SCALE
const SNOUT_WIDTH = 8 * SCALE   // Big prominent snout
const SNOUT_HEIGHT = 5 * SCALE
const SNOUT_DEPTH = 3 * SCALE
const HORN_LENGTH = 6 * SCALE   // Bigger horns
const HORN_WIDTH = 2 * SCALE
const EYE_SIZE = 2.5 * SCALE    // Bigger eyes
const UDDER_WIDTH = 8 * SCALE   // Bigger udder
const UDDER_HEIGHT = 3 * SCALE
const UDDER_DEPTH = 6 * SCALE

/**
 * A cow entity that wanders randomly around the world.
 * Similar to pigs but with a different appearance.
 */
export class CowEntity extends PeacefulEntity {
  readonly type = 'cow'

  // Animation state
  private legAnimPhase = 0
  private headBobPhase = 0

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null

  // Shared texture (loaded once)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false

  // Track if this cow's materials have the texture applied
  private textureApplied = false

  constructor(config: IPeacefulEntityConfig) {
    super('cow', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.2, 1.8, 2.2), // Big cow hitbox
      walkSpeed: 1.6, // Slower, lumbering cow
      drops: [
        { createItem: () => new RawBeefItem(), minCount: 1, maxCount: 3 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Load texture if not already loaded
    if (!CowEntity.texture && !CowEntity.textureLoading) {
      CowEntity.textureLoading = true
      const loader = new THREE.TextureLoader()
      loader.load(cowTextureUrl, (texture) => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        CowEntity.texture = texture
        // Each cow will apply the texture in its update loop
      })
    }

    // Create materials - use white base so texture shows true colors
    const bodyMaterial = this.createMaterial(0xffffff)
    const snoutMaterial = new THREE.MeshLambertMaterial({ color: COW_SNOUT })
    const hornMaterial = new THREE.MeshLambertMaterial({ color: COW_HORN })
    const udderMaterial = new THREE.MeshLambertMaterial({ color: COW_UDDER })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(bodyMaterial)
    this.registerMaterialForLighting(snoutMaterial)
    this.registerMaterialForLighting(hornMaterial)
    this.registerMaterialForLighting(udderMaterial)

    // Body
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Head
    const headGroup = new THREE.Group()
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout (lighter colored, extends from face)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, snoutMaterial)
    snout.position.z = HEAD_DEPTH / 2 + SNOUT_DEPTH / 2
    snout.position.y = -HEAD_HEIGHT / 4
    snout.castShadow = true
    headGroup.add(snout)

    // Nostrils (dark spots on snout)
    const nostrilMaterial = new THREE.MeshLambertMaterial({ color: COW_DARK })
    const nostrilGeometry = new THREE.BoxGeometry(0.5 * SCALE, 0.5 * SCALE, 0.3 * SCALE)

    const leftNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial)
    leftNostril.position.set(-SNOUT_WIDTH / 4, -SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2 + 0.01)
    snout.add(leftNostril)

    const rightNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial)
    rightNostril.position.set(SNOUT_WIDTH / 4, -SNOUT_HEIGHT / 4, SNOUT_DEPTH / 2 + 0.01)
    snout.add(rightNostril)

    // Eyes (dark)
    const eyeMaterial = new THREE.MeshLambertMaterial({ color: COW_DARK })
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.6, EYE_SIZE * 0.7, EYE_SIZE * 0.2)

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    leftEye.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 6, HEAD_DEPTH / 2 + 0.01)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    rightEye.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 6, HEAD_DEPTH / 2 + 0.01)
    headGroup.add(rightEye)

    // Eye highlights (white sparkles for life)
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const highlightGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.25, EYE_SIZE * 0.25, EYE_SIZE * 0.1)

    const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    leftHighlight.position.set(-HEAD_WIDTH / 3 + EYE_SIZE * 0.1, HEAD_HEIGHT / 6 + EYE_SIZE * 0.15, HEAD_DEPTH / 2 + 0.02)
    headGroup.add(leftHighlight)

    const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    rightHighlight.position.set(HEAD_WIDTH / 3 + EYE_SIZE * 0.1, HEAD_HEIGHT / 6 + EYE_SIZE * 0.15, HEAD_DEPTH / 2 + 0.02)
    headGroup.add(rightHighlight)

    // Horns (curved beige)
    const hornGeometry = new THREE.BoxGeometry(HORN_WIDTH, HORN_LENGTH, HORN_WIDTH)

    const leftHorn = new THREE.Mesh(hornGeometry, hornMaterial)
    leftHorn.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + HORN_LENGTH / 3, 0)
    leftHorn.rotation.z = 0.3 // Angle outward
    leftHorn.castShadow = true
    headGroup.add(leftHorn)

    const rightHorn = new THREE.Mesh(hornGeometry, hornMaterial)
    rightHorn.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + HORN_LENGTH / 3, 0)
    rightHorn.rotation.z = -0.3 // Angle outward
    rightHorn.castShadow = true
    headGroup.add(rightHorn)

    // Ears (small flaps on sides of head)
    const earGeometry = new THREE.BoxGeometry(2 * SCALE, 1.5 * SCALE, 3 * SCALE)

    const leftEar = new THREE.Mesh(earGeometry, bodyMaterial)
    leftEar.position.set(-HEAD_WIDTH / 2 - 0.5 * SCALE, HEAD_HEIGHT / 4, 0)
    leftEar.rotation.z = 0.5
    leftEar.castShadow = true
    headGroup.add(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, bodyMaterial)
    rightEar.position.set(HEAD_WIDTH / 2 + 0.5 * SCALE, HEAD_HEIGHT / 4, 0)
    rightEar.rotation.z = -0.5
    rightEar.castShadow = true
    headGroup.add(rightEar)

    // Position head
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2 + HEAD_HEIGHT / 4
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_DEPTH / 3
    group.add(headGroup)
    this.head = headGroup

    // Legs (4 legs, taller than pig)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const legPositions = [
      { x: BODY_WIDTH / 3, z: BODY_DEPTH / 3 }, // Front right
      { x: -BODY_WIDTH / 3, z: BODY_DEPTH / 3 }, // Front left
      { x: BODY_WIDTH / 3, z: -BODY_DEPTH / 3 }, // Back right
      { x: -BODY_WIDTH / 3, z: -BODY_DEPTH / 3 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.castShadow = true
      leg.receiveShadow = true
      group.add(leg)
      this.legs.push(leg)
    }

    // Udder (pink, underneath body near back legs)
    const udderGeometry = new THREE.BoxGeometry(UDDER_WIDTH, UDDER_HEIGHT, UDDER_DEPTH)
    const udder = new THREE.Mesh(udderGeometry, udderMaterial)
    udder.position.set(0, LEG_HEIGHT - UDDER_HEIGHT / 2 + 0.02, -BODY_DEPTH / 4)
    udder.castShadow = true
    group.add(udder)

    // Mark texture as applied if it was available during mesh creation
    if (CowEntity.texture) {
      this.textureApplied = true
    }

    return group
  }

  private createMaterial(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    if (CowEntity.texture) {
      material.map = CowEntity.texture
    }
    return material
  }

  private updateMaterials(group: THREE.Object3D): void {
    if (!CowEntity.texture) return

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        // Only apply texture to white-based body materials
        const color = child.material.color.getHex()
        if (color === 0xffffff) {
          child.material.map = CowEntity.texture
          child.material.needsUpdate = true
        }
      }
    })
  }

  update(deltaTime: number): void {
    // Apply texture if it's loaded but not yet applied to this cow
    if (CowEntity.texture && !this.textureApplied) {
      const mesh = this.getMesh()
      if (mesh) {
        this.updateMaterials(mesh)
        this.textureApplied = true
      }
    }

    // Call parent update (handles all AI, combat, death animation)
    super.update(deltaTime)
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.isWalking) {
      // Leg animation while walking
      this.legAnimPhase += deltaTime * 8 // Speed of leg movement
      const legSwing = Math.sin(this.legAnimPhase) * 0.4

      // Front legs swing opposite to back legs
      if (this.legs.length >= 4) {
        this.legs[0].rotation.x = legSwing // Front right
        this.legs[1].rotation.x = -legSwing // Front left
        this.legs[2].rotation.x = -legSwing // Back right
        this.legs[3].rotation.x = legSwing // Back left
      }
    } else {
      // Reset legs when standing
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9 // Smoothly return to neutral
      }

      // Head bob while idle
      this.headBobPhase += deltaTime * 2
      if (this.head) {
        this.head.rotation.x = Math.sin(this.headBobPhase) * 0.05
        this.head.rotation.z = Math.sin(this.headBobPhase * 0.7) * 0.03
      }
    }
  }

  dispose(): void {
    // Clear references
    this.legs = []
    this.head = null
    super.dispose()
  }
}
