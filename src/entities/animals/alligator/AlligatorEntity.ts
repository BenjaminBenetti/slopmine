import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { RawAlligatorMeatItem } from '../../../items/food/raw_alligator_meat/RawAlligatorMeatItem.ts'
import { AlligatorLeatherItem } from '../../../items/materials/alligator_leather/AlligatorLeatherItem.ts'

// Import alligator texture
import alligatorTextureUrl from './assets/alligator-texture.webp'

// Alligator colors
const GATOR_GREEN = 0x355e3b // Dark green
const GATOR_BELLY = 0x8b9556 // Lighter yellow-green belly
const GATOR_DARK = 0x1a1a1a // Eyes/details
const GATOR_TEETH = 0xf5f5dc // Beige teeth

// Alligator dimensions (in world units) - long, low profile
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 12 * SCALE // ~0.75 blocks wide
const BODY_HEIGHT = 6 * SCALE // ~0.375 blocks tall (low profile)
const BODY_DEPTH = 32 * SCALE // 2 blocks long body
const HEAD_WIDTH = 8 * SCALE
const HEAD_HEIGHT = 5 * SCALE
const HEAD_DEPTH = 6 * SCALE
const SNOUT_WIDTH = 6 * SCALE
const SNOUT_HEIGHT = 3 * SCALE
const SNOUT_DEPTH = 12 * SCALE // Long snout
const JAW_WIDTH = 5 * SCALE
const JAW_HEIGHT = 2 * SCALE
const JAW_DEPTH = 10 * SCALE
const LEG_WIDTH = 3 * SCALE
const LEG_HEIGHT = 4 * SCALE // Short, stubby legs
const LEG_DEPTH = 4 * SCALE
const TAIL_WIDTH = 8 * SCALE
const TAIL_HEIGHT = 5 * SCALE
const TAIL_DEPTH = 20 * SCALE // Long tail
const TAIL_TIP_WIDTH = 4 * SCALE
const TAIL_TIP_HEIGHT = 3 * SCALE
const TAIL_TIP_DEPTH = 12 * SCALE
const EYE_SIZE = 2 * SCALE

/**
 * An alligator entity that lives in swamps.
 * Unlike other peaceful mobs, alligators become aggressive when hit
 * and will chase and attack the player.
 */
export class AlligatorEntity extends AggressiveEntity {
  readonly type = 'alligator'

  // Animation state
  private legAnimPhase = 0
  private tailSwayPhase = 0
  private bitePhase = 0
  private isBiting = false

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null
  private jaw: THREE.Object3D | null = null

  // Shared texture (loaded once)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false
  private textureApplied = false

  constructor(config: IAggressiveEntityConfig) {
    super('alligator', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.0, 0.6, 2.5), // Long, low hitbox
      walkSpeed: 1.5, // Slow when wandering
      maxHealth: 20, // Tougher than most animals
      // Aggressive behavior config
      aggressionMode: AggressionMode.AGGRESSIVE_WHEN_PROVOKED,
      chaseSpeed: 5.0, // Fast when chasing
      attackRange: 2.0,
      attackCooldown: 1.5,
      attackDamage: 4, // 2 hearts
      attackKnockbackHorizontal: 3.0,
      attackKnockbackVertical: 5.0,
      provokedDuration: 10.0,
      // Drops
      drops: [
        { createItem: () => new RawAlligatorMeatItem(), minCount: 2, maxCount: 4 },
        { createItem: () => new AlligatorLeatherItem(), minCount: 1, maxCount: 2 },
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Load texture if not already loaded
    if (!AlligatorEntity.texture && !AlligatorEntity.textureLoading) {
      AlligatorEntity.textureLoading = true
      const loader = new THREE.TextureLoader()
      loader.load(alligatorTextureUrl, (texture) => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        // Enable tiling for scaly texture
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(4, 4) // Tile the scales across body
        AlligatorEntity.texture = texture
      })
    }

    // Create materials
    const bodyMaterial = this.createMaterial(GATOR_GREEN)
    const bellyMaterial = new THREE.MeshLambertMaterial({ color: GATOR_BELLY })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: GATOR_DARK })
    const teethMaterial = new THREE.MeshLambertMaterial({ color: GATOR_TEETH })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(bodyMaterial)
    this.registerMaterialForLighting(bellyMaterial)
    this.registerMaterialForLighting(darkMaterial)
    this.registerMaterialForLighting(teethMaterial)

    // Body (long, low rectangle)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Belly (lighter underside)
    const bellyGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.8, BODY_HEIGHT * 0.3, BODY_DEPTH * 0.9)
    const belly = new THREE.Mesh(bellyGeometry, bellyMaterial)
    belly.position.y = LEG_HEIGHT + BODY_HEIGHT * 0.2
    group.add(belly)

    // Scaly ridges on back (small bumps)
    const ridgeGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.3, BODY_HEIGHT * 0.2, BODY_DEPTH * 0.08)
    for (let i = 0; i < 8; i++) {
      const ridge = new THREE.Mesh(ridgeGeometry, bodyMaterial)
      ridge.position.set(0, LEG_HEIGHT + BODY_HEIGHT + BODY_HEIGHT * 0.05, BODY_DEPTH * 0.4 - i * BODY_DEPTH * 0.1)
      ridge.castShadow = true
      group.add(ridge)
    }

    // Head group
    const headGroup = new THREE.Group()

    // Head base
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Upper snout (long, flat)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, bodyMaterial)
    snout.position.z = HEAD_DEPTH / 2 + SNOUT_DEPTH / 2
    snout.position.y = -HEAD_HEIGHT / 6
    snout.castShadow = true
    headGroup.add(snout)

    // Nostrils (at tip of snout)
    const nostrilGeometry = new THREE.BoxGeometry(1 * SCALE, 1 * SCALE, 0.5 * SCALE)
    const leftNostril = new THREE.Mesh(nostrilGeometry, darkMaterial)
    leftNostril.position.set(-SNOUT_WIDTH / 4, SNOUT_HEIGHT / 3, SNOUT_DEPTH / 2)
    snout.add(leftNostril)

    const rightNostril = new THREE.Mesh(nostrilGeometry, darkMaterial)
    rightNostril.position.set(SNOUT_WIDTH / 4, SNOUT_HEIGHT / 3, SNOUT_DEPTH / 2)
    snout.add(rightNostril)

    // Teeth on upper jaw
    const toothGeometry = new THREE.BoxGeometry(0.5 * SCALE, 1 * SCALE, 0.5 * SCALE)
    for (let i = 0; i < 6; i++) {
      const toothLeft = new THREE.Mesh(toothGeometry, teethMaterial)
      toothLeft.position.set(-SNOUT_WIDTH / 2 + 0.3 * SCALE, -SNOUT_HEIGHT / 2 - 0.3 * SCALE, SNOUT_DEPTH * 0.3 - i * SNOUT_DEPTH * 0.1)
      snout.add(toothLeft)

      const toothRight = new THREE.Mesh(toothGeometry, teethMaterial)
      toothRight.position.set(SNOUT_WIDTH / 2 - 0.3 * SCALE, -SNOUT_HEIGHT / 2 - 0.3 * SCALE, SNOUT_DEPTH * 0.3 - i * SNOUT_DEPTH * 0.1)
      snout.add(toothRight)
    }

    // Lower jaw (for bite animation)
    const jawGroup = new THREE.Group()
    const jawGeometry = new THREE.BoxGeometry(JAW_WIDTH, JAW_HEIGHT, JAW_DEPTH)
    const jawMesh = new THREE.Mesh(jawGeometry, bodyMaterial)
    jawMesh.castShadow = true
    jawGroup.add(jawMesh)

    // Teeth on lower jaw
    for (let i = 0; i < 5; i++) {
      const toothLeft = new THREE.Mesh(toothGeometry, teethMaterial)
      toothLeft.position.set(-JAW_WIDTH / 2 + 0.3 * SCALE, JAW_HEIGHT / 2 + 0.3 * SCALE, JAW_DEPTH * 0.3 - i * JAW_DEPTH * 0.12)
      jawMesh.add(toothLeft)

      const toothRight = new THREE.Mesh(toothGeometry, teethMaterial)
      toothRight.position.set(JAW_WIDTH / 2 - 0.3 * SCALE, JAW_HEIGHT / 2 + 0.3 * SCALE, JAW_DEPTH * 0.3 - i * JAW_DEPTH * 0.12)
      jawMesh.add(toothRight)
    }

    // Position jaw below snout, pivot at back
    jawGroup.position.z = HEAD_DEPTH / 2 + JAW_DEPTH / 2
    jawGroup.position.y = -HEAD_HEIGHT / 3 - JAW_HEIGHT / 2
    headGroup.add(jawGroup)
    this.jaw = jawGroup

    // Eyes (on top/sides of head - reptilian style, bulging out)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.8, EYE_SIZE * 0.6, EYE_SIZE * 0.8)
    const eyeBaseGeometry = new THREE.BoxGeometry(EYE_SIZE * 1.2, EYE_SIZE * 0.4, EYE_SIZE * 1.2)

    // Left eye bump
    const leftEyeBase = new THREE.Mesh(eyeBaseGeometry, bodyMaterial)
    leftEyeBase.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2, HEAD_DEPTH / 4)
    headGroup.add(leftEyeBase)

    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.3, HEAD_DEPTH / 4)
    headGroup.add(leftEye)

    // Right eye bump
    const rightEyeBase = new THREE.Mesh(eyeBaseGeometry, bodyMaterial)
    rightEyeBase.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2, HEAD_DEPTH / 4)
    headGroup.add(rightEyeBase)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.3, HEAD_DEPTH / 4)
    headGroup.add(rightEye)

    // Eye slits (vertical pupils)
    const pupilGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.15, EYE_SIZE * 0.5, EYE_SIZE * 0.3)
    const pupilMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 })

    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
    leftPupil.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.35, HEAD_DEPTH / 4 + EYE_SIZE * 0.3)
    headGroup.add(leftPupil)

    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
    rightPupil.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.35, HEAD_DEPTH / 4 + EYE_SIZE * 0.3)
    headGroup.add(rightPupil)

    // Position head at front of body
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_DEPTH / 3
    group.add(headGroup)
    this.head = headGroup

    // Tail group
    const tailGroup = new THREE.Group()

    // Main tail segment
    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tailMesh = new THREE.Mesh(tailGeometry, bodyMaterial)
    tailMesh.castShadow = true
    tailMesh.receiveShadow = true
    tailGroup.add(tailMesh)

    // Tail tip (smaller, tapered)
    const tailTipGeometry = new THREE.BoxGeometry(TAIL_TIP_WIDTH, TAIL_TIP_HEIGHT, TAIL_TIP_DEPTH)
    const tailTip = new THREE.Mesh(tailTipGeometry, bodyMaterial)
    tailTip.position.z = -TAIL_DEPTH / 2 - TAIL_TIP_DEPTH / 2
    tailTip.castShadow = true
    tailGroup.add(tailTip)

    // Position tail at back of body
    tailGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    tailGroup.position.z = -BODY_DEPTH / 2 - TAIL_DEPTH / 3
    group.add(tailGroup)
    this.tail = tailGroup

    // Legs (4 short, stubby legs splayed outward)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const legPositions = [
      { x: BODY_WIDTH / 2 + LEG_WIDTH / 4, z: BODY_DEPTH / 3, rotZ: -0.4 }, // Front right (splayed)
      { x: -BODY_WIDTH / 2 - LEG_WIDTH / 4, z: BODY_DEPTH / 3, rotZ: 0.4 }, // Front left (splayed)
      { x: BODY_WIDTH / 2 + LEG_WIDTH / 4, z: -BODY_DEPTH / 3, rotZ: -0.4 }, // Back right
      { x: -BODY_WIDTH / 2 - LEG_WIDTH / 4, z: -BODY_DEPTH / 3, rotZ: 0.4 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.rotation.z = pos.rotZ // Splay legs outward
      leg.castShadow = true
      leg.receiveShadow = true
      group.add(leg)
      this.legs.push(leg)
    }

    // Mark texture as applied if it was available during mesh creation
    if (AlligatorEntity.texture) {
      this.textureApplied = true
    }

    return group
  }

  private createMaterial(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    if (AlligatorEntity.texture) {
      material.map = AlligatorEntity.texture
    }
    return material
  }

  private updateMaterials(group: THREE.Object3D): void {
    if (!AlligatorEntity.texture) return

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        const color = child.material.color.getHex()
        if (color === GATOR_GREEN) {
          child.material.map = AlligatorEntity.texture
          child.material.needsUpdate = true
        }
      }
    })
  }

  /**
   * Override performAttack to trigger bite animation.
   */
  protected performAttack(): void {
    // Trigger bite animation
    this.isBiting = true
    this.bitePhase = 0

    // Call parent to deal damage
    super.performAttack()
  }

  update(deltaTime: number): void {
    // Apply texture if it's loaded but not yet applied
    if (AlligatorEntity.texture && !this.textureApplied) {
      const mesh = this.getMesh()
      if (mesh) {
        this.updateMaterials(mesh)
        this.textureApplied = true
      }
    }

    // Call parent update (handles aggression, wandering, death, etc.)
    super.update(deltaTime)
  }

  protected updateAnimations(deltaTime: number): void {
    // Bite animation
    if (this.isBiting) {
      this.bitePhase += deltaTime * 12 // Fast bite
      if (this.jaw) {
        if (this.bitePhase < Math.PI) {
          // Open jaw
          this.jaw.rotation.x = Math.sin(this.bitePhase) * 0.6
        } else {
          // Close jaw
          this.jaw.rotation.x = 0
          this.isBiting = false
        }
      }
    }

    if (this.isWalking) {
      // Leg animation while walking - alligator waddle
      this.legAnimPhase += deltaTime * 6
      const legSwing = Math.sin(this.legAnimPhase) * 0.3

      if (this.legs.length >= 4) {
        // Alligator walk: diagonal pairs move together
        this.legs[0].rotation.x = legSwing // Front right
        this.legs[3].rotation.x = legSwing // Back left
        this.legs[1].rotation.x = -legSwing // Front left
        this.legs[2].rotation.x = -legSwing // Back right
      }

      // Tail sway while moving
      this.tailSwayPhase += deltaTime * 4
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailSwayPhase) * 0.2
      }
    } else {
      // Reset legs when standing
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9
      }

      // Gentle tail sway while idle
      this.tailSwayPhase += deltaTime * 1.5
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailSwayPhase) * 0.1
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    this.tail = null
    this.jaw = null
    super.dispose()
  }
}
