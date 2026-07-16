import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawPorkItem } from '../../../items/food/raw_pork/RawPorkItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Import pig texture
import pigTextureUrl from './assets/pig-texture.webp'

// Pig colors
const PIG_PINK = 0xf5a9b8
const PIG_SNOUT = 0xffccd5
const PIG_DARK = 0x1a1a1a // Dark color for eyes/nostrils
const PIG_ROSY = 0xe88a9a // Rosy cheek color

// Pig dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 10 * SCALE
const BODY_HEIGHT = 8 * SCALE
const BODY_DEPTH = 14 * SCALE
const HEAD_SIZE = 6 * SCALE
const LEG_WIDTH = 3 * SCALE
const LEG_HEIGHT = 4 * SCALE
const LEG_DEPTH = 3 * SCALE
const SNOUT_WIDTH = 3 * SCALE
const SNOUT_HEIGHT = 2 * SCALE
const SNOUT_DEPTH = 1.5 * SCALE
const NOSTRIL_SIZE = 0.5 * SCALE
const NOSTRIL_DEPTH = 0.3 * SCALE
const EYE_SIZE = 1.5 * SCALE

/**
 * A pig entity that wanders randomly around the world.
 */
export class PigEntity extends PeacefulEntity {
  readonly type = 'pig'

  // Animation state
  private legAnimPhase = 0
  private headBobPhase = 0

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null

  // Shared texture (loaded once)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false

  // Track if this pig's materials have the texture applied
  private textureApplied = false

  constructor(config: IPeacefulEntityConfig) {
    super('pig', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 1.0, 0.9),
      drops: [
        { createItem: () => new RawPorkItem(), minCount: 1, maxCount: 3 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Load texture if not already loaded
    if (!PigEntity.texture && !PigEntity.textureLoading) {
      PigEntity.textureLoading = true
      const loader = new THREE.TextureLoader()
      loader.load(pigTextureUrl, (texture) => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        PigEntity.texture = texture
        // Each pig will apply the texture in its update loop
      })
    }

    // Create materials
    const bodyMaterial = this.createMaterial(PIG_PINK)
    const snoutMaterial = this.createMaterial(PIG_SNOUT)

    // Register materials for light-based dimming
    this.registerMaterialForLighting(bodyMaterial)
    this.registerMaterialForLighting(snoutMaterial)

    // Body
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Head
    const headGroup = new THREE.Group()
    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE)
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, snoutMaterial)
    snout.position.z = HEAD_SIZE / 2 + SNOUT_DEPTH / 2
    snout.position.y = -HEAD_SIZE / 6
    snout.castShadow = true
    headGroup.add(snout)

    // Nostrils (dark holes on snout)
    const nostrilMaterial = new THREE.MeshLambertMaterial({ color: PIG_DARK })
    const nostrilGeometry = new THREE.BoxGeometry(NOSTRIL_SIZE, NOSTRIL_SIZE, NOSTRIL_DEPTH)

    const leftNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial)
    leftNostril.position.set(-SNOUT_WIDTH / 4, 0, SNOUT_DEPTH / 2 + NOSTRIL_DEPTH / 2)
    snout.add(leftNostril)

    const rightNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial)
    rightNostril.position.set(SNOUT_WIDTH / 4, 0, SNOUT_DEPTH / 2 + NOSTRIL_DEPTH / 2)
    snout.add(rightNostril)

    // Eyes (dark with white highlights for a happy look)
    const eyeMaterial = new THREE.MeshLambertMaterial({ color: PIG_DARK })
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.6, EYE_SIZE * 0.7, EYE_SIZE * 0.2)

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    leftEye.position.set(-HEAD_SIZE / 4, HEAD_SIZE / 5, HEAD_SIZE / 2 + 0.01)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    rightEye.position.set(HEAD_SIZE / 4, HEAD_SIZE / 5, HEAD_SIZE / 2 + 0.01)
    headGroup.add(rightEye)

    // Eye highlights (white sparkles for life)
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const highlightGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.25, EYE_SIZE * 0.25, EYE_SIZE * 0.1)

    const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    leftHighlight.position.set(-HEAD_SIZE / 4 + EYE_SIZE * 0.1, HEAD_SIZE / 5 + EYE_SIZE * 0.15, HEAD_SIZE / 2 + 0.02)
    headGroup.add(leftHighlight)

    const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    rightHighlight.position.set(HEAD_SIZE / 4 + EYE_SIZE * 0.1, HEAD_SIZE / 5 + EYE_SIZE * 0.15, HEAD_SIZE / 2 + 0.02)
    headGroup.add(rightHighlight)

    // Rosy cheeks (small pink circles below eyes)
    const cheekMaterial = new THREE.MeshLambertMaterial({ color: PIG_ROSY })
    const cheekGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.8, EYE_SIZE * 0.5, EYE_SIZE * 0.15)

    const leftCheek = new THREE.Mesh(cheekGeometry, cheekMaterial)
    leftCheek.position.set(-HEAD_SIZE / 3, -HEAD_SIZE / 8, HEAD_SIZE / 2 + 0.01)
    headGroup.add(leftCheek)

    const rightCheek = new THREE.Mesh(cheekGeometry, cheekMaterial)
    rightCheek.position.set(HEAD_SIZE / 3, -HEAD_SIZE / 8, HEAD_SIZE / 2 + 0.01)
    headGroup.add(rightCheek)

    // Position head
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2 + HEAD_SIZE / 4
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_SIZE / 3
    group.add(headGroup)
    this.head = headGroup

    // Legs (4 legs)
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

    // Mark texture as applied if it was available during mesh creation
    if (PigEntity.texture) {
      this.textureApplied = true
    }

    // Freeze static nodes. Not merged: the texture is applied at runtime by
    // color match, which a white vertex-color material would break. Legs and
    // head animate.
    optimizeEntityMesh(group, {
      dynamic: [...this.legs, this.head],
    })

    return group
  }

  private createMaterial(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    if (PigEntity.texture) {
      material.map = PigEntity.texture
    }
    return material
  }

  private updateMaterials(group: THREE.Object3D): void {
    if (!PigEntity.texture) return

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        // Only apply body texture to pink body parts, not eyes/cheeks/nostrils
        const color = child.material.color.getHex()
        if (color === PIG_PINK || color === PIG_SNOUT) {
          child.material.map = PigEntity.texture
          child.material.needsUpdate = true
        }
      }
    })
  }

  update(deltaTime: number): void {
    // Apply texture if it's loaded but not yet applied to this pig
    if (PigEntity.texture && !this.textureApplied) {
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
