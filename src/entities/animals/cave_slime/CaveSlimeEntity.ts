import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import { SlimeBallItem } from '../../../items/materials/slime_ball/SlimeBallItem.ts'

// Cave slime colors - slimy green appearance
const SLIME_GREEN = 0x4caf50
const SLIME_LIGHT_GREEN = 0x8bc34a
const SLIME_DARK_GREEN = 0x2e7d32
const SLIME_YELLOW_GREEN = 0xcddc39

// Dimensions (same as magma slime)
const SCALE = 0.0625
const BODY_SIZE = 14 * SCALE // ~0.875 blocks
const BODY_HEIGHT = 12 * SCALE // ~0.75 blocks (squatty)

// Hopping behavior constants (same as magma slime)
const HOP_COOLDOWN_MIN = 0.8
const HOP_COOLDOWN_MAX = 1.5
const HOP_DIRECTION_VARIANCE = Math.PI / 8 // +/-22.5 degrees random variance
const IDLE_HOP_CHANCE = 0.15 // 15% chance per second to do idle hop
const HIGH_JUMP_VELOCITY = 10.0 // Higher jump to clear blocks when stuck

// Stuck detection constants
const STUCK_MOVEMENT_RATIO = 0.2 // If moving less than 20% of expected, we're stuck
const STUCK_TIME_THRESHOLD = 0.5 // Seconds of being stuck before high jump

/**
 * A cave slime entity that hops around in dark areas.
 * Aggressive toward players - will chase and attack on sight.
 * Drops slime balls when killed.
 */
export class CaveSlimeEntity extends AggressiveEntity {
  readonly type = 'cave_slime'

  // Hopping state
  private hopCooldown = 0
  private isInAir = false
  private hopDirection = new THREE.Vector3()

  // Stuck detection state (prefixed to avoid conflict with parent)
  private readonly slimeStuckCheckPosition = new THREE.Vector3()
  private slimeStuckTime = 0
  private slimeHasTriedHighJump = false

  // Animation state
  private jigglePhase = 0

  // Mesh references for animation
  private outerBody: THREE.Mesh | null = null
  private innerCore: THREE.Mesh | null = null

  constructor(config: IAggressiveEntityConfig) {
    super('cave_slime', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 1.0, 0.9),
      walkSpeed: 2.5, // Slower movement
      jumpVelocity: 6.0, // Lower hops
      wanderMinDistance: 3.0,
      wanderMaxDistance: 6.0,
      wanderMinInterval: 2.0,
      wanderMaxInterval: 5.0,
      maxHealth: 8,
      drops: [
        { createItem: () => new SlimeBallItem(), minCount: 1, maxCount: 2 },
      ],
      // Aggressive configuration
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      detectionRange: 12, // Slightly shorter detection range
      chaseSpeed: 3.5, // Slower chase (hops instead of runs)
      attackRange: 1.5, // Close range attack
      attackCooldown: 1.0, // Fast attacks
      attackDamage: 3, // 1.5 hearts
      attackKnockbackHorizontal: 3.0,
      attackKnockbackVertical: 2.0,
      aggroTimeout: 8.0, // Longer memory
    })

    // Start with a random hop cooldown
    this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Outer body - semi-transparent green
    const outerMaterial = new THREE.MeshLambertMaterial({
      color: SLIME_GREEN,
      transparent: true,
      opacity: 0.6,
    })

    // Inner core - brighter, more opaque
    const innerMaterial = new THREE.MeshLambertMaterial({
      color: SLIME_LIGHT_GREEN,
      transparent: true,
      opacity: 0.8,
    })

    // Darker spots material
    const spotMaterial = new THREE.MeshLambertMaterial({
      color: SLIME_DARK_GREEN,
      transparent: true,
      opacity: 0.9,
    })

    // Register materials for dynamic lighting
    this.registerMaterialForLighting(outerMaterial)
    this.registerMaterialForLighting(innerMaterial)
    this.registerMaterialForLighting(spotMaterial)

    // Outer body geometry
    const outerGeometry = new THREE.BoxGeometry(BODY_SIZE, BODY_HEIGHT, BODY_SIZE)
    this.outerBody = new THREE.Mesh(outerGeometry, outerMaterial)
    this.outerBody.position.y = BODY_HEIGHT / 2
    this.outerBody.castShadow = true
    this.outerBody.receiveShadow = true
    group.add(this.outerBody)

    // Inner core (smaller, centered)
    const coreSize = BODY_SIZE * 0.6
    const coreHeight = BODY_HEIGHT * 0.6
    const coreGeometry = new THREE.BoxGeometry(coreSize, coreHeight, coreSize)
    this.innerCore = new THREE.Mesh(coreGeometry, innerMaterial)
    this.innerCore.position.y = BODY_HEIGHT * 0.45
    group.add(this.innerCore)

    // Dark spots (3 patches on surface)
    const spotSize = BODY_SIZE * 0.15
    const spotGeometry = new THREE.BoxGeometry(spotSize, spotSize, spotSize * 0.3)
    const spotPositions = [
      { x: 0.25, y: 0.6, z: 0.45 },
      { x: -0.2, y: 0.35, z: -0.4 },
      { x: 0.35, y: 0.75, z: -0.15 },
    ]
    for (const pos of spotPositions) {
      const spot = new THREE.Mesh(spotGeometry, spotMaterial)
      spot.position.set(
        pos.x * BODY_SIZE,
        pos.y * BODY_HEIGHT,
        pos.z * BODY_SIZE
      )
      group.add(spot)
    }

    // Eyes - yellow-green glowing spots
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: SLIME_YELLOW_GREEN })
    const eyeGeometry = new THREE.BoxGeometry(
      BODY_SIZE * 0.12,
      BODY_SIZE * 0.08,
      BODY_SIZE * 0.05
    )
    for (const xMult of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
      eye.position.set(
        xMult * BODY_SIZE * 0.22,
        BODY_HEIGHT * 0.55,
        BODY_SIZE / 2 + 0.01
      )
      group.add(eye)
    }

    // Render order for proper transparency
    group.renderOrder = 1

    return group
  }

  update(deltaTime: number): void {
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

    // Just landed - reset hop cooldown and apply sticky friction
    if (wasInAir && !this.isInAir) {
      this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)
      // More friction than rabbit (slimes are sticky)
      body.velocity.x *= 0.2
      body.velocity.z *= 0.2

      // Check if we're still stuck after high jump - pick new direction
      if (this.slimeHasTriedHighJump) {
        this.slimeHasTriedHighJump = false
        this.slimeStuckTime = 0
      }
    }

    // Update hop cooldown
    if (!this.isInAir) {
      this.hopCooldown -= deltaTime
    }

    // Call parent update (handles aggression, chase, attack, etc.)
    super.update(deltaTime)

    // Stuck detection - check if we're trying to move but not making progress
    if (!this.isInAir && this.hopDirection.lengthSq() > 0) {
      const actualMoveX = this.position.x - this.slimeStuckCheckPosition.x
      const actualMoveZ = this.position.z - this.slimeStuckCheckPosition.z
      const movementInDirection =
        actualMoveX * this.hopDirection.x + actualMoveZ * this.hopDirection.z
      const expectedMovement = this.walkSpeed * deltaTime

      if (movementInDirection < expectedMovement * STUCK_MOVEMENT_RATIO) {
        this.slimeStuckTime += deltaTime

        // If stuck for too long, do a high jump to clear obstacles
        if (this.slimeStuckTime >= STUCK_TIME_THRESHOLD && !this.slimeHasTriedHighJump && body.isOnGround) {
          this.performHighJump()
        }
      } else {
        // We're moving, reset stuck tracking
        this.slimeStuckTime = 0
        if (body.isOnGround) {
          this.slimeHasTriedHighJump = false
        }
      }
    }

    // After parent update, check if we should hop instead of walk
    if (!this.isInAir && this.hopCooldown <= 0 && body.isOnGround) {
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

    // Update last position for stuck detection
    this.slimeStuckCheckPosition.copy(this.position)
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

    // Trigger jiggle animation
    this.jigglePhase = 0
  }

  /**
   * Perform a high jump to clear obstacles when stuck.
   */
  private performHighJump(): void {
    const body = this.getPhysicsBody()
    if (!body) return

    // Apply high jump with current direction
    body.velocity.x = this.hopDirection.x || 0
    body.velocity.z = this.hopDirection.z || 0
    body.velocity.y = HIGH_JUMP_VELOCITY

    // Mark that we've tried a high jump
    this.slimeHasTriedHighJump = true
    this.slimeStuckTime = 0
    this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)

    // Trigger jiggle animation
    this.jigglePhase = 0
  }

  protected updateAnimations(deltaTime: number): void {
    // Update jiggle phase
    this.jigglePhase += deltaTime * 4

    if (this.outerBody && this.innerCore) {
      if (this.isInAir) {
        // Stretch vertically when jumping
        const stretch = 1 + Math.sin(this.jigglePhase * 2) * 0.2
        this.outerBody.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch))
        this.innerCore.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch))
      } else {
        // Squish when on ground with idle jiggle
        const squish = 1 + Math.sin(this.jigglePhase * 2) * 0.08
        this.outerBody.scale.set(squish, 1 / squish, squish)
        this.innerCore.scale.set(squish, 1 / squish, squish)
      }
    }
  }

  dispose(): void {
    this.outerBody = null
    this.innerCore = null
    super.dispose()
  }
}
