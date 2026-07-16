import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { RawRabbitItem } from '../../../items/food/raw_rabbit/RawRabbitItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Import rabbit texture
import rabbitTextureUrl from './assets/rabbit-texture.webp'

// Rabbit colors
const RABBIT_BROWN = 0xb5926b
const RABBIT_LIGHT = 0xd4c4a8
const RABBIT_WHITE = 0xf5f5f0
const RABBIT_DARK = 0x1a1a1a // Eyes
const RABBIT_PINK = 0xffb6c1 // Inner ear, nose

// Rabbit dimensions (in world units)
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 5 * SCALE
const BODY_HEIGHT = 4 * SCALE
const BODY_DEPTH = 7 * SCALE
const HEAD_WIDTH = 4 * SCALE
const HEAD_HEIGHT = 4 * SCALE
const HEAD_DEPTH = 4 * SCALE
const EAR_WIDTH = 1 * SCALE
const EAR_HEIGHT = 5 * SCALE
const EAR_DEPTH = 1 * SCALE
const FRONT_LEG_WIDTH = 1.5 * SCALE
const FRONT_LEG_HEIGHT = 2 * SCALE
const FRONT_LEG_DEPTH = 1.5 * SCALE
const BACK_LEG_WIDTH = 2 * SCALE
const BACK_LEG_HEIGHT = 3 * SCALE
const BACK_LEG_DEPTH = 3 * SCALE
const TAIL_SIZE = 2 * SCALE
const EYE_SIZE = 1 * SCALE

// Hopping behavior constants
const HOP_COOLDOWN_MIN = 0.3 // Minimum time between hops (seconds)
const HOP_COOLDOWN_MAX = 0.6 // Maximum time between hops (seconds)
const HOP_DIRECTION_VARIANCE = Math.PI / 7 // ±25 degrees random variance
const IDLE_HOP_CHANCE = 0.2 // 20% chance per second to do idle hop

/**
 * A rabbit entity that hops around the world.
 * Unlike pigs that walk continuously, rabbits move by hopping.
 */
export class RabbitEntity extends PeacefulEntity {
  readonly type = 'rabbit'

  // Hopping state
  private hopCooldown = 0
  private isInAir = false
  private hopDirection = new THREE.Vector3()

  // Animation state
  private hopPhase = 0
  private earWobblePhase = 0

  // Mesh references for animation
  private body: THREE.Object3D | null = null
  private head: THREE.Object3D | null = null
  private ears: THREE.Mesh[] = []
  private frontLegs: THREE.Mesh[] = []
  private backLegs: THREE.Mesh[] = []

  // Shared texture (loaded once)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false

  // Track if this rabbit's materials have the texture applied
  private textureApplied = false

  constructor(config: IPeacefulEntityConfig) {
    super('rabbit', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.4, 0.5, 0.4),
      walkSpeed: 4.0, // Fast burst speed during hops
      jumpVelocity: 8.75,
      wanderMinDistance: 2.0,
      wanderMaxDistance: 5.0,
      wanderMinInterval: 1.0,
      wanderMaxInterval: 3.0,
      maxHealth: 4, // Fragile
      drops: [{ createItem: () => new RawRabbitItem(), minCount: 0, maxCount: 1 }],
    })

    // Start with a random hop cooldown
    this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Load texture if not already loaded
    if (!RabbitEntity.texture && !RabbitEntity.textureLoading) {
      RabbitEntity.textureLoading = true
      const loader = new THREE.TextureLoader()
      loader.load(rabbitTextureUrl, (texture) => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        RabbitEntity.texture = texture
        // Each rabbit will apply the texture in its update loop
      })
    }

    // Materials
    const brownMaterial = this.createMaterial(RABBIT_BROWN)
    const lightMaterial = this.createMaterial(RABBIT_LIGHT)
    const whiteMaterial = this.createMaterial(RABBIT_WHITE)
    const darkMaterial = new THREE.MeshLambertMaterial({ color: RABBIT_DARK })
    const pinkMaterial = new THREE.MeshLambertMaterial({ color: RABBIT_PINK })

    // Register materials for light-based dimming
    this.registerMaterialForLighting(brownMaterial)
    this.registerMaterialForLighting(lightMaterial)
    this.registerMaterialForLighting(whiteMaterial)
    this.registerMaterialForLighting(darkMaterial)
    this.registerMaterialForLighting(pinkMaterial)

    // Body group (for squash/stretch animation)
    const bodyGroup = new THREE.Group()

    // Main body - oval shape
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const bodyMesh = new THREE.Mesh(bodyGeometry, brownMaterial)
    bodyMesh.position.y = BACK_LEG_HEIGHT + BODY_HEIGHT / 2
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    bodyGroup.add(bodyMesh)

    // White belly
    const bellyGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.8, BODY_HEIGHT * 0.3, BODY_DEPTH * 0.8)
    const belly = new THREE.Mesh(bellyGeometry, whiteMaterial)
    belly.position.y = BACK_LEG_HEIGHT + BODY_HEIGHT * 0.2
    bodyGroup.add(belly)

    group.add(bodyGroup)
    this.body = bodyGroup

    // Head group
    const headGroup = new THREE.Group()
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, brownMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Snout/cheeks (lighter color)
    const snoutGeometry = new THREE.BoxGeometry(HEAD_WIDTH * 0.6, HEAD_HEIGHT * 0.4, HEAD_DEPTH * 0.3)
    const snout = new THREE.Mesh(snoutGeometry, lightMaterial)
    snout.position.z = HEAD_DEPTH / 2 + HEAD_DEPTH * 0.1
    snout.position.y = -HEAD_HEIGHT * 0.15
    headGroup.add(snout)

    // Nose
    const noseGeometry = new THREE.BoxGeometry(HEAD_WIDTH * 0.2, HEAD_HEIGHT * 0.15, HEAD_DEPTH * 0.1)
    const nose = new THREE.Mesh(noseGeometry, pinkMaterial)
    nose.position.z = HEAD_DEPTH / 2 + HEAD_DEPTH * 0.25
    nose.position.y = -HEAD_HEIGHT * 0.1
    headGroup.add(nose)

    // Eyes
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE, EYE_SIZE, EYE_SIZE * 0.3)
    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT * 0.1, HEAD_DEPTH / 2 + 0.01)
    headGroup.add(leftEye)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT * 0.1, HEAD_DEPTH / 2 + 0.01)
    headGroup.add(rightEye)

    // Eye highlights
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const highlightGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.3, EYE_SIZE * 0.3, EYE_SIZE * 0.1)

    const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    leftHighlight.position.set(-HEAD_WIDTH / 3 + EYE_SIZE * 0.15, HEAD_HEIGHT * 0.1 + EYE_SIZE * 0.15, HEAD_DEPTH / 2 + 0.02)
    headGroup.add(leftHighlight)

    const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial)
    rightHighlight.position.set(HEAD_WIDTH / 3 + EYE_SIZE * 0.15, HEAD_HEIGHT * 0.1 + EYE_SIZE * 0.15, HEAD_DEPTH / 2 + 0.02)
    headGroup.add(rightHighlight)

    // Ears (key rabbit feature!)
    const earGeometry = new THREE.BoxGeometry(EAR_WIDTH, EAR_HEIGHT, EAR_DEPTH)

    const leftEar = new THREE.Mesh(earGeometry, brownMaterial)
    leftEar.position.set(-HEAD_WIDTH / 4, HEAD_HEIGHT / 2 + EAR_HEIGHT / 2, -HEAD_DEPTH * 0.1)
    leftEar.castShadow = true
    headGroup.add(leftEar)
    this.ears.push(leftEar)

    const rightEar = new THREE.Mesh(earGeometry, brownMaterial)
    rightEar.position.set(HEAD_WIDTH / 4, HEAD_HEIGHT / 2 + EAR_HEIGHT / 2, -HEAD_DEPTH * 0.1)
    rightEar.castShadow = true
    headGroup.add(rightEar)
    this.ears.push(rightEar)

    // Inner ear (pink)
    const innerEarGeometry = new THREE.BoxGeometry(EAR_WIDTH * 0.5, EAR_HEIGHT * 0.7, EAR_DEPTH * 0.3)

    const leftInnerEar = new THREE.Mesh(innerEarGeometry, pinkMaterial)
    leftInnerEar.position.set(0, 0, EAR_DEPTH / 2 + 0.01)
    leftEar.add(leftInnerEar)

    const rightInnerEar = new THREE.Mesh(innerEarGeometry, pinkMaterial)
    rightInnerEar.position.set(0, 0, EAR_DEPTH / 2 + 0.01)
    rightEar.add(rightInnerEar)

    // Position head
    headGroup.position.y = BACK_LEG_HEIGHT + BODY_HEIGHT / 2 + HEAD_HEIGHT * 0.3
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_DEPTH * 0.2
    group.add(headGroup)
    this.head = headGroup

    // Front legs (small)
    const frontLegGeometry = new THREE.BoxGeometry(FRONT_LEG_WIDTH, FRONT_LEG_HEIGHT, FRONT_LEG_DEPTH)

    const leftFrontLeg = new THREE.Mesh(frontLegGeometry, brownMaterial)
    leftFrontLeg.position.set(-BODY_WIDTH / 4, FRONT_LEG_HEIGHT / 2, BODY_DEPTH / 3)
    leftFrontLeg.castShadow = true
    group.add(leftFrontLeg)
    this.frontLegs.push(leftFrontLeg)

    const rightFrontLeg = new THREE.Mesh(frontLegGeometry, brownMaterial)
    rightFrontLeg.position.set(BODY_WIDTH / 4, FRONT_LEG_HEIGHT / 2, BODY_DEPTH / 3)
    rightFrontLeg.castShadow = true
    group.add(rightFrontLeg)
    this.frontLegs.push(rightFrontLeg)

    // Back legs (large, powerful)
    const backLegGeometry = new THREE.BoxGeometry(BACK_LEG_WIDTH, BACK_LEG_HEIGHT, BACK_LEG_DEPTH)

    const leftBackLeg = new THREE.Mesh(backLegGeometry, brownMaterial)
    leftBackLeg.position.set(-BODY_WIDTH / 3, BACK_LEG_HEIGHT / 2, -BODY_DEPTH / 3)
    leftBackLeg.castShadow = true
    group.add(leftBackLeg)
    this.backLegs.push(leftBackLeg)

    const rightBackLeg = new THREE.Mesh(backLegGeometry, brownMaterial)
    rightBackLeg.position.set(BODY_WIDTH / 3, BACK_LEG_HEIGHT / 2, -BODY_DEPTH / 3)
    rightBackLeg.castShadow = true
    group.add(rightBackLeg)
    this.backLegs.push(rightBackLeg)

    // Fluffy tail (white puff)
    const tailGeometry = new THREE.BoxGeometry(TAIL_SIZE, TAIL_SIZE, TAIL_SIZE)
    const tail = new THREE.Mesh(tailGeometry, whiteMaterial)
    tail.position.set(0, BACK_LEG_HEIGHT + BODY_HEIGHT / 2, -BODY_DEPTH / 2 - TAIL_SIZE / 3)
    tail.castShadow = true
    group.add(tail)

    // Mark texture as applied if it was available during mesh creation
    if (RabbitEntity.texture) {
      this.textureApplied = true
    }

    // Freeze static nodes (tail, head decorations). Not merged: the texture is
    // applied at runtime by color match. Body (stretch), legs, ears and head
    // animate.
    optimizeEntityMesh(group, {
      dynamic: [this.body, ...this.backLegs, ...this.frontLegs, ...this.ears, this.head],
    })

    return group
  }

  private createMaterial(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    if (RabbitEntity.texture) {
      material.map = RabbitEntity.texture
    }
    return material
  }

  private updateMaterials(group: THREE.Object3D): void {
    if (!RabbitEntity.texture) return

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        // Only apply texture to fur parts (brown, light, white), not eyes/nose/inner ear
        const color = child.material.color.getHex()
        if (color === RABBIT_BROWN || color === RABBIT_LIGHT || color === RABBIT_WHITE) {
          child.material.map = RabbitEntity.texture
          child.material.needsUpdate = true
        }
      }
    })
  }

  update(deltaTime: number): void {
    // Apply texture if it's loaded but not yet applied to this rabbit
    if (RabbitEntity.texture && !this.textureApplied) {
      const mesh = this.getMesh()
      if (mesh) {
        this.updateMaterials(mesh)
        this.textureApplied = true
      }
    }

    // Skip hopping logic if dying
    if (this.isDying) {
      super.update(deltaTime)
      return
    }

    const body = this.getPhysicsBody()
    if (!body) {
      super.update(deltaTime)
      return
    }

    // Track air state
    const wasInAir = this.isInAir
    this.isInAir = !body.isOnGround

    // Just landed - reset hop cooldown
    if (wasInAir && !this.isInAir) {
      this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)
      // Stop horizontal movement on landing briefly
      body.velocity.x *= 0.3
      body.velocity.z *= 0.3
    }

    // Update hop cooldown
    if (!this.isInAir) {
      this.hopCooldown -= deltaTime
    }

    // Call parent update (handles wandering AI, combat, etc.)
    super.update(deltaTime)

    // After parent update, check if we should hop instead of walk
    if (!this.isInAir && this.hopCooldown <= 0 && body.isOnGround) {
      // Check if we're trying to move (parent set velocity)
      const isMoving = Math.abs(body.velocity.x) > 0.1 || Math.abs(body.velocity.z) > 0.1

      if (isMoving) {
        // Hop toward our movement direction with random variance
        this.performHop(body.velocity.x, body.velocity.z)
      } else {
        // Random idle hop
        if (Math.random() < IDLE_HOP_CHANCE * deltaTime) {
          const randomAngle = Math.random() * Math.PI * 2
          const hopSpeed = this.walkSpeed * 0.5
          this.performHop(
            Math.cos(randomAngle) * hopSpeed,
            Math.sin(randomAngle) * hopSpeed
          )
        }
      }
    }

    // If in air, maintain hop direction
    if (this.isInAir && this.hopDirection.lengthSq() > 0) {
      body.velocity.x = this.hopDirection.x
      body.velocity.z = this.hopDirection.z
    }
  }

  private performHop(targetVelX: number, targetVelZ: number): void {
    const body = this.getPhysicsBody()
    if (!body) return

    // Add random direction variance
    const currentAngle = Math.atan2(targetVelZ, targetVelX)
    const variance = (Math.random() - 0.5) * 2 * HOP_DIRECTION_VARIANCE
    const newAngle = currentAngle + variance

    // Calculate hop velocity
    const speed = Math.sqrt(targetVelX * targetVelX + targetVelZ * targetVelZ)
    const hopVelX = Math.cos(newAngle) * speed
    const hopVelZ = Math.sin(newAngle) * speed

    // Apply hop
    body.velocity.x = hopVelX
    body.velocity.z = hopVelZ
    body.velocity.y = this.jumpVelocity

    // Store hop direction for air control
    this.hopDirection.set(hopVelX, 0, hopVelZ)

    // Reset cooldown
    this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)

    // Update facing direction
    const mesh = this.getMesh()
    if (mesh && (hopVelX !== 0 || hopVelZ !== 0)) {
      mesh.rotation.y = Math.atan2(hopVelX, hopVelZ)
    }

    // Trigger hop animation
    this.hopPhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    // Hop animation
    if (this.isInAir) {
      this.hopPhase += deltaTime * 8

      // Body stretch during jump
      if (this.body) {
        const stretch = 1 + Math.sin(this.hopPhase) * 0.15
        this.body.scale.set(1, stretch, 1)
      }

      // Back legs extend during jump
      for (const leg of this.backLegs) {
        leg.rotation.x = -0.5 // Legs back during jump
      }

      // Front legs forward
      for (const leg of this.frontLegs) {
        leg.rotation.x = 0.3
      }
    } else {
      // Reset body scale
      if (this.body) {
        this.body.scale.lerp(new THREE.Vector3(1, 1, 1), deltaTime * 10)
      }

      // Reset legs
      for (const leg of this.backLegs) {
        leg.rotation.x *= 0.9
      }
      for (const leg of this.frontLegs) {
        leg.rotation.x *= 0.9
      }
    }

    // Ear wobble
    this.earWobblePhase += deltaTime * 4
    for (let i = 0; i < this.ears.length; i++) {
      const ear = this.ears[i]
      const offset = i * Math.PI // Opposite phase for each ear
      ear.rotation.z = Math.sin(this.earWobblePhase + offset) * 0.1
      ear.rotation.x = Math.sin(this.earWobblePhase * 0.7 + offset) * 0.05
    }

    // Head bob when idle
    if (!this.isInAir && !this.isWalking && this.head) {
      this.head.rotation.x = Math.sin(this.earWobblePhase * 0.5) * 0.03
    }
  }

  dispose(): void {
    this.body = null
    this.head = null
    this.ears = []
    this.frontLegs = []
    this.backLegs = []
    super.dispose()
  }
}
