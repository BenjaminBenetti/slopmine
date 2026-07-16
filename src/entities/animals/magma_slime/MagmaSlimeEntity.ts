import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import { MagmaBlockItem } from '../../../items/blocks/magma/MagmaBlockItem.ts'
import { CoalItem } from '../../../items/ores/coal/CoalItem.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'

// Magma slime colors - fiery, glowing appearance
const MAGMA_ORANGE = 0xff6600
const MAGMA_RED = 0xcc2200
const MAGMA_YELLOW = 0xffcc00
const MAGMA_BLACK = 0x1a1a1a

// Dimensions (pig-sized)
const SCALE = 0.0625
const BODY_SIZE = 14 * SCALE // ~0.875 blocks
const BODY_HEIGHT = 12 * SCALE // ~0.75 blocks (squatty)

// Hopping behavior constants (slower than rabbit)
const HOP_COOLDOWN_MIN = 0.8
const HOP_COOLDOWN_MAX = 1.5
const HOP_DIRECTION_VARIANCE = Math.PI / 8 // ±22.5 degrees random variance
const IDLE_HOP_CHANCE = 0.15 // 15% chance per second to do idle hop
const HIGH_JUMP_VELOCITY = 10.0 // Higher jump to clear blocks when stuck

// Stuck detection constants
const STUCK_MOVEMENT_RATIO = 0.2 // If moving less than 20% of expected, we're stuck
const STUCK_TIME_THRESHOLD = 0.5 // Seconds of being stuck before high jump

// Contact damage constants
const CONTACT_DAMAGE = 2 // 1 heart per contact
const CONTACT_COOLDOWN = 1.0 // Seconds between damage ticks
const CONTACT_RANGE = 1.2 // Blocks - proximity for damage
const CONTACT_KNOCKBACK_HORIZONTAL = 4.0
const CONTACT_KNOCKBACK_VERTICAL = 2.0

/**
 * A magma slime entity that hops around volcanic biomes.
 * Deals contact damage to players who touch it.
 * Drops magma blocks and coal when killed.
 */
export class MagmaSlimeEntity extends PeacefulEntity {
  readonly type = 'magma_slime'

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
  private glowIntensity = 0.3

  // Contact damage state
  private contactDamageCooldown = 0
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null
  private playerPositionRef: THREE.Vector3 | null = null

  // Mesh references for animation
  private outerBody: THREE.Mesh | null = null
  private innerCore: THREE.Mesh | null = null
  private outerMaterial: THREE.MeshLambertMaterial | null = null
  private innerMaterial: THREE.MeshLambertMaterial | null = null

  constructor(config: IPeacefulEntityConfig) {
    super('magma_slime', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(0.9, 1.0, 0.9),
      walkSpeed: 2.5, // Slower than rabbit
      jumpVelocity: 6.0, // Lower hops
      wanderMinDistance: 3.0,
      wanderMaxDistance: 6.0,
      wanderMinInterval: 2.0,
      wanderMaxInterval: 5.0,
      maxHealth: 12,
      drops: [
        { createItem: () => new MagmaBlockItem(), minCount: 1, maxCount: 2 },
        { createItem: () => new CoalItem(), minCount: 1, maxCount: 3 },
      ],
    })

    // Start with a random hop cooldown
    this.hopCooldown = this.randomRange(HOP_COOLDOWN_MIN, HOP_COOLDOWN_MAX)
  }

  /**
   * Set callback for damaging the player on contact.
   */
  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    this.playerDamageCallback = callback
  }

  /**
   * Update player position reference for contact checking.
   */
  updatePlayerPosition(playerPosition: THREE.Vector3): void {
    this.playerPositionRef = playerPosition
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Note: MagmaSlime does NOT register materials for lighting.
    // The emissive materials should keep it glowing in the dark,
    // which is thematically appropriate for a living lava creature.

    // Outer body - semi-transparent orange/red
    this.outerMaterial = new THREE.MeshLambertMaterial({
      color: MAGMA_RED,
      transparent: true,
      opacity: 0.6,
      emissive: new THREE.Color(MAGMA_ORANGE),
      emissiveIntensity: 0.3,
    })

    // Inner core - brighter, more opaque
    this.innerMaterial = new THREE.MeshLambertMaterial({
      color: MAGMA_ORANGE,
      transparent: true,
      opacity: 0.8,
      emissive: new THREE.Color(MAGMA_YELLOW),
      emissiveIntensity: 0.5,
    })

    // Crust material - darker, cooled patches
    const crustMaterial = new THREE.MeshLambertMaterial({
      color: MAGMA_BLACK,
      transparent: true,
      opacity: 0.9,
    })

    // Outer body geometry
    const outerGeometry = new THREE.BoxGeometry(BODY_SIZE, BODY_HEIGHT, BODY_SIZE)
    this.outerBody = new THREE.Mesh(outerGeometry, this.outerMaterial)
    this.outerBody.position.y = BODY_HEIGHT / 2
    this.outerBody.castShadow = true
    this.outerBody.receiveShadow = true
    group.add(this.outerBody)

    // Inner core (smaller, centered)
    const coreSize = BODY_SIZE * 0.6
    const coreHeight = BODY_HEIGHT * 0.6
    const coreGeometry = new THREE.BoxGeometry(coreSize, coreHeight, coreSize)
    this.innerCore = new THREE.Mesh(coreGeometry, this.innerMaterial)
    this.innerCore.position.y = BODY_HEIGHT * 0.45
    group.add(this.innerCore)

    // Cooled crust spots (3 dark patches on surface)
    const spotSize = BODY_SIZE * 0.15
    const spotGeometry = new THREE.BoxGeometry(spotSize, spotSize, spotSize * 0.3)
    const spotPositions = [
      { x: 0.25, y: 0.6, z: 0.45 },
      { x: -0.2, y: 0.35, z: -0.4 },
      { x: 0.35, y: 0.75, z: -0.15 },
    ]
    for (const pos of spotPositions) {
      const spot = new THREE.Mesh(spotGeometry, crustMaterial)
      spot.position.set(
        pos.x * BODY_SIZE,
        pos.y * BODY_HEIGHT,
        pos.z * BODY_SIZE
      )
      group.add(spot)
    }

    // Eyes - bright yellow glowing spots
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: MAGMA_YELLOW })
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

    // Freeze static nodes (crust spots, eyes). The outer body and inner core
    // animate via scale; all materials are translucent/emissive so none merge.
    optimizeEntityMesh(group, {
      dynamic: [this.outerBody, this.innerCore],
    })

    return group
  }

  private checkContactDamage(deltaTime: number): void {
    if (!this.playerPositionRef || !this.playerDamageCallback) return
    if (this.isDying || !this.isAlive) return

    // Update cooldown
    this.contactDamageCooldown = Math.max(0, this.contactDamageCooldown - deltaTime)
    if (this.contactDamageCooldown > 0) return

    // Check distance to player
    const dx = this.position.x - this.playerPositionRef.x
    const dy = this.position.y - this.playerPositionRef.y
    const dz = this.position.z - this.playerPositionRef.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq < CONTACT_RANGE * CONTACT_RANGE) {
      // Calculate knockback direction (away from slime)
      const knockback = new THREE.Vector3(-dx, 0, -dz)
      if (knockback.lengthSq() > 0) {
        knockback.normalize()
      } else {
        knockback.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
      }
      knockback.multiplyScalar(CONTACT_KNOCKBACK_HORIZONTAL)
      knockback.y = CONTACT_KNOCKBACK_VERTICAL

      // Apply damage
      this.playerDamageCallback(CONTACT_DAMAGE, knockback)
      this.contactDamageCooldown = CONTACT_COOLDOWN
    }
  }

  update(deltaTime: number): void {
    // Check contact damage first
    this.checkContactDamage(deltaTime)

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

    // Call parent update (handles wandering AI, combat, etc.)
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

    // Pulsing glow effect
    this.glowIntensity = 0.3 + Math.sin(this.jigglePhase * 0.8) * 0.2
    if (this.innerMaterial) {
      this.innerMaterial.emissiveIntensity = this.glowIntensity + 0.2
    }
    if (this.outerMaterial) {
      this.outerMaterial.emissiveIntensity = this.glowIntensity
    }
  }

  dispose(): void {
    this.outerBody = null
    this.innerCore = null
    this.outerMaterial = null
    this.innerMaterial = null
    this.playerDamageCallback = null
    this.playerPositionRef = null
    super.dispose()
  }
}
