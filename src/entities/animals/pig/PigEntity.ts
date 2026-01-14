import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'

// Import pig texture
import pigTextureUrl from './assets/pig-texture.webp'

// Pig colors
const PIG_PINK = 0xf5a9b8
const PIG_SNOUT = 0xffccd5
const PIG_DARK = 0x1a1a1a // Dark color for eyes/nostrils
const PIG_ROSY = 0xe88a9a // Rosy cheek color

// Movement constants
const WALK_SPEED = 2.0 // blocks per second
const WANDER_MIN_INTERVAL = 3.0 // seconds
const WANDER_MAX_INTERVAL = 8.0 // seconds
const WANDER_MIN_DISTANCE = 4.0 // blocks
const WANDER_MAX_DISTANCE = 8.0 // blocks
const JUMP_VELOCITY = 8.0 // blocks per second (slightly less than player)
const STUCK_MOVEMENT_RATIO = 0.2 // if moving less than 20% of expected, we're stuck
const STUCK_TIME_THRESHOLD = 0.4 // seconds of being stuck before reacting

// Combat constants
const MAX_HEALTH = 10 // 10 HP
const BASE_DAMAGE = 2 // Fist damage
const KNOCKBACK_HORIZONTAL = 6.0 // blocks/sec push away from player
const KNOCKBACK_VERTICAL = 5.0 // blocks/sec upward

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
export class PigEntity extends Entity {
  readonly type = 'pig'

  // Wandering AI state
  private wanderTarget: THREE.Vector3 | null = null
  private wanderCooldown: number = 0
  private readonly wanderDirection = new THREE.Vector3()

  // Obstacle detection state
  private readonly lastPosition = new THREE.Vector3()
  private stuckTime: number = 0
  private hasTriedJump: boolean = false

  // Animation state
  private legAnimPhase = 0
  private headBobPhase = 0
  private isWalking = false

  // Health state
  private health = MAX_HEALTH

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null

  // Shared texture (loaded once)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false

  // Track if this pig's materials have the texture applied
  private textureApplied = false

  constructor(config: IEntityConfig) {
    super('pig', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 1.0, 0.9),
    })

    // Set initial wander cooldown
    this.wanderCooldown = this.randomRange(WANDER_MIN_INTERVAL, WANDER_MAX_INTERVAL)
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
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
    super.update(deltaTime)

    // Apply texture if it's loaded but not yet applied to this pig
    if (PigEntity.texture && !this.textureApplied) {
      const mesh = this.getMesh()
      if (mesh) {
        this.updateMaterials(mesh)
        this.textureApplied = true
      }
    }

    // Update wander cooldown
    this.wanderCooldown -= deltaTime

    // Check if we need a new wander target
    if (this.wanderCooldown <= 0) {
      this.pickNewWanderTarget()
      this.wanderCooldown = this.randomRange(WANDER_MIN_INTERVAL, WANDER_MAX_INTERVAL)
    }

    // Move toward wander target
    const body = this.getPhysicsBody()
    if (this.wanderTarget && body) {
      this.wanderDirection.copy(this.wanderTarget).sub(this.position)
      this.wanderDirection.y = 0 // Only move horizontally

      const distance = this.wanderDirection.length()

      if (distance > 0.5) {
        // Check if we're stuck (trying to move but not moving in intended direction)
        // Use dot product to measure movement in the direction we want to go
        const actualMoveX = this.position.x - this.lastPosition.x
        const actualMoveZ = this.position.z - this.lastPosition.z
        const movementInDirection =
          actualMoveX * this.wanderDirection.x + actualMoveZ * this.wanderDirection.z
        const expectedMovement = WALK_SPEED * deltaTime

        // Stuck if we're not making progress in our intended direction
        if (this.isWalking && movementInDirection < expectedMovement * STUCK_MOVEMENT_RATIO) {
          // We're stuck!
          this.stuckTime += deltaTime

          if (this.stuckTime >= STUCK_TIME_THRESHOLD) {
            if (!this.hasTriedJump && body.isOnGround) {
              // Try jumping over 1-block obstacle
              body.velocity.y = JUMP_VELOCITY
              this.hasTriedJump = true
              this.stuckTime = 0
            } else if (this.hasTriedJump || !body.isOnGround) {
              // Already tried jumping or in the air - wait until we land
              if (body.isOnGround && this.hasTriedJump) {
                // We landed and are still stuck - obstacle is too high, pick new direction
                this.pickNewWanderTarget()
                this.hasTriedJump = false
                this.stuckTime = 0
              }
            }
          }
        } else {
          // We're moving, reset stuck tracking
          this.stuckTime = 0
          if (body.isOnGround) {
            this.hasTriedJump = false
          }
        }

        // Still moving toward target - set velocity on physics body
        this.wanderDirection.normalize()
        body.velocity.x = this.wanderDirection.x * WALK_SPEED
        body.velocity.z = this.wanderDirection.z * WALK_SPEED
        this.isWalking = true

        // Face movement direction
        const mesh = this.getMesh()
        if (mesh && (this.wanderDirection.x !== 0 || this.wanderDirection.z !== 0)) {
          mesh.rotation.y = Math.atan2(this.wanderDirection.x, this.wanderDirection.z)
        }
      } else {
        // Reached target - stop moving
        this.wanderTarget = null
        body.velocity.x = 0
        body.velocity.z = 0
        this.isWalking = false
        this.hasTriedJump = false
        this.stuckTime = 0
      }
    } else if (body && !this.wanderTarget) {
      // No target, ensure stopped
      body.velocity.x = 0
      body.velocity.z = 0
    }

    // Update last position for stuck detection
    this.lastPosition.copy(this.position)

    // Update animations
    this.updateAnimations(deltaTime)
  }

  private pickNewWanderTarget(): void {
    // Pick a random direction and distance
    const angle = Math.random() * Math.PI * 2
    const distance = this.randomRange(WANDER_MIN_DISTANCE, WANDER_MAX_DISTANCE)

    this.wanderTarget = new THREE.Vector3(
      this.position.x + Math.cos(angle) * distance,
      this.position.y,
      this.position.z + Math.sin(angle) * distance
    )
  }

  private updateAnimations(deltaTime: number): void {
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

  onSpawn(): void {
    // Initialize last position for stuck detection
    this.lastPosition.copy(this.position)
  }

  /**
   * Check if player can interact with this pig.
   */
  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive) return false
    const dist = this.position.distanceTo(playerPosition)
    return dist <= maxDistance
  }

  /**
   * Handle player hitting this pig.
   */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick) return false
    if (!this.isAlive) return false

    // Calculate damage from held item
    let damage = BASE_DAMAGE
    if (heldItem && 'toolStats' in heldItem) {
      const toolItem = heldItem as { toolStats: { damage: number } }
      damage = toolItem.toolStats.damage
    }

    // Apply damage
    this.health -= damage

    // Calculate knockback direction (away from player)
    const knockbackDir = new THREE.Vector3()
      .copy(this.position)
      .sub(playerPosition)
    knockbackDir.y = 0
    if (knockbackDir.lengthSq() > 0) {
      knockbackDir.normalize()
    } else {
      // Player is exactly on pig, pick random direction
      knockbackDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }

    // Apply knockback to physics body
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = knockbackDir.x * KNOCKBACK_HORIZONTAL
      body.velocity.z = knockbackDir.z * KNOCKBACK_HORIZONTAL
      body.velocity.y = KNOCKBACK_VERTICAL
    }

    // Check death
    if (this.health <= 0) {
      console.log("oooof");
      this.kill()
    }

    return true
  }

  dispose(): void {
    // Clear references
    this.legs = []
    this.head = null
    this.wanderTarget = null
    super.dispose()
  }
}
