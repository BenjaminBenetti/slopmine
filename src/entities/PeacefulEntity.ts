import * as THREE from 'three'
import { Entity } from './Entity.ts'
import type { IEntityConfig } from './interfaces/IEntityConfig.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IItem } from '../items/Item.ts'

// Default movement constants
const DEFAULT_WALK_SPEED = 2.0 // blocks per second
const DEFAULT_WANDER_MIN_INTERVAL = 3.0 // seconds
const DEFAULT_WANDER_MAX_INTERVAL = 8.0 // seconds
const DEFAULT_WANDER_MIN_DISTANCE = 4.0 // blocks
const DEFAULT_WANDER_MAX_DISTANCE = 8.0 // blocks
const DEFAULT_JUMP_VELOCITY = 8.0 // blocks per second
const DEFAULT_STUCK_MOVEMENT_RATIO = 0.2 // if moving less than 20% of expected, we're stuck
const DEFAULT_STUCK_TIME_THRESHOLD = 0.4 // seconds of being stuck before reacting

// Default combat constants
const DEFAULT_MAX_HEALTH = 10
const DEFAULT_BASE_DAMAGE = 2 // Fist damage
const DEFAULT_KNOCKBACK_HORIZONTAL = 6.0 // blocks/sec push away from player
const DEFAULT_KNOCKBACK_VERTICAL = 5.0 // blocks/sec upward
const DEFAULT_KNOCKBACK_STUN_TIME = 0.4 // seconds to disable AI after being hit

// Default flee constants
const DEFAULT_FLEE_SPEED = 4.0 // blocks per second (faster than walk)
const DEFAULT_FLEE_DURATION = 3.0 // seconds to flee after being hit

// Default death animation constants
const DEFAULT_DEATH_FALL_DURATION = 0.5 // seconds to fall over
const DEFAULT_DEATH_LINGER_DURATION = 1.0 // seconds to stay on ground before despawn

/**
 * Configurable drop for entities.
 * Can specify a factory function to create items and min/max counts.
 */
export interface IEntityDrop {
  /** Factory function to create the item instance */
  createItem: () => IItem
  /** Minimum count to drop (default 1) */
  minCount?: number
  /** Maximum count to drop (default = minCount) */
  maxCount?: number
}

/**
 * Configuration for peaceful entities.
 */
export interface IPeacefulEntityConfig extends IEntityConfig {
  // Movement
  walkSpeed?: number
  wanderMinInterval?: number
  wanderMaxInterval?: number
  wanderMinDistance?: number
  wanderMaxDistance?: number
  jumpVelocity?: number

  // Combat
  maxHealth?: number
  knockbackHorizontal?: number
  knockbackVertical?: number
  knockbackStunTime?: number

  // Flee
  fleeSpeed?: number
  fleeDuration?: number

  // Death
  deathFallDuration?: number
  deathLingerDuration?: number

  // Drops
  /** Items to drop when entity dies */
  drops?: IEntityDrop[]
}

/**
 * Base class for peaceful (non-hostile) entities like pigs, cows, sheep.
 * Provides wandering AI, health system, knockback, flee behavior, and death animation.
 *
 * Subclasses should:
 * 1. Override createMesh() to provide their visual representation
 * 2. Override updateAnimations() for entity-specific animations
 * 3. Override dispose() to clean up custom resources
 */
export abstract class PeacefulEntity extends Entity {
  // Configuration (from constructor)
  protected readonly walkSpeed: number
  protected readonly wanderMinInterval: number
  protected readonly wanderMaxInterval: number
  protected readonly wanderMinDistance: number
  protected readonly wanderMaxDistance: number
  protected readonly jumpVelocity: number
  protected readonly maxHealth: number
  protected readonly knockbackHorizontal: number
  protected readonly knockbackVertical: number
  protected readonly knockbackStunTime: number
  protected readonly fleeSpeed: number
  protected readonly fleeDuration: number
  protected readonly deathFallDuration: number
  protected readonly deathLingerDuration: number
  protected readonly drops: IEntityDrop[]

  // Wandering AI state
  private wanderTarget: THREE.Vector3 | null = null
  private wanderCooldown: number = 0
  private readonly wanderDirection = new THREE.Vector3()

  // Obstacle detection state
  private readonly lastPosition = new THREE.Vector3()
  private stuckTime: number = 0
  private hasTriedJump: boolean = false

  // Animation state (protected for subclass access)
  protected isWalking = false

  // Health state
  protected health: number
  protected knockbackTimer = 0
  protected fleeTimer = 0
  protected readonly fleeDirection = new THREE.Vector3()
  protected _isDying = false
  protected deathTimer = 0
  private dropsCollected = false

  /** Whether the entity is in the process of dying (death animation playing) */
  get isDying(): boolean {
    return this._isDying
  }

  constructor(type: string, config: IPeacefulEntityConfig) {
    super(type, config)

    // Apply configuration with defaults
    this.walkSpeed = config.walkSpeed ?? DEFAULT_WALK_SPEED
    this.wanderMinInterval = config.wanderMinInterval ?? DEFAULT_WANDER_MIN_INTERVAL
    this.wanderMaxInterval = config.wanderMaxInterval ?? DEFAULT_WANDER_MAX_INTERVAL
    this.wanderMinDistance = config.wanderMinDistance ?? DEFAULT_WANDER_MIN_DISTANCE
    this.wanderMaxDistance = config.wanderMaxDistance ?? DEFAULT_WANDER_MAX_DISTANCE
    this.jumpVelocity = config.jumpVelocity ?? DEFAULT_JUMP_VELOCITY
    this.maxHealth = config.maxHealth ?? DEFAULT_MAX_HEALTH
    this.knockbackHorizontal = config.knockbackHorizontal ?? DEFAULT_KNOCKBACK_HORIZONTAL
    this.knockbackVertical = config.knockbackVertical ?? DEFAULT_KNOCKBACK_VERTICAL
    this.knockbackStunTime = config.knockbackStunTime ?? DEFAULT_KNOCKBACK_STUN_TIME
    this.fleeSpeed = config.fleeSpeed ?? DEFAULT_FLEE_SPEED
    this.fleeDuration = config.fleeDuration ?? DEFAULT_FLEE_DURATION
    this.deathFallDuration = config.deathFallDuration ?? DEFAULT_DEATH_FALL_DURATION
    this.deathLingerDuration = config.deathLingerDuration ?? DEFAULT_DEATH_LINGER_DURATION
    this.drops = config.drops ?? []

    // Initialize health
    this.health = this.maxHealth

    // Set initial wander cooldown
    this.wanderCooldown = this.randomRange(this.wanderMinInterval, this.wanderMaxInterval)
  }

  /**
   * Generate a random number in range [min, max].
   */
  protected randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
  }

  /**
   * Update animations for this entity.
   * Subclasses must implement this for entity-specific animations.
   * @param deltaTime Time since last frame in seconds
   */
  protected abstract updateAnimations(deltaTime: number): void

  update(deltaTime: number): void {
    super.update(deltaTime)

    // Handle death animation
    if (this._isDying) {
      this.deathTimer += deltaTime
      const mesh = this.getMesh()
      const body = this.getPhysicsBody()

      // Stop all movement
      if (body) {
        body.velocity.x = 0
        body.velocity.z = 0
      }

      // Animate falling over (rotate on Z axis)
      if (mesh) {
        const fallProgress = Math.min(this.deathTimer / this.deathFallDuration, 1.0)
        // Ease out for natural fall
        const easedProgress = 1 - Math.pow(1 - fallProgress, 2)
        mesh.rotation.z = easedProgress * (Math.PI / 2) // Rotate 90 degrees
      }

      // After fall + linger, actually die
      if (this.deathTimer >= this.deathFallDuration + this.deathLingerDuration) {
        this.kill()
      }

      return
    }

    // Handle knockback stun - skip AI while stunned
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      // Still update animations while stunned
      this.updateAnimations(deltaTime)
      return
    }

    // Handle flee state - run away from player at higher speed
    if (this.fleeTimer > 0) {
      this.fleeTimer -= deltaTime
      const body = this.getPhysicsBody()
      if (body) {
        // Jump 1-block obstacles just like wandering does; if a jump didn't
        // clear it (wall too high), deflect the escape route sideways instead
        // of pinning against the wall
        if (this.handleObstacleWhileMoving(body, this.fleeDirection, this.fleeSpeed, deltaTime)) {
          const turn = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2)
          const cos = Math.cos(turn)
          const sin = Math.sin(turn)
          const dx = this.fleeDirection.x
          const dz = this.fleeDirection.z
          this.fleeDirection.set(dx * cos - dz * sin, 0, dx * sin + dz * cos)
        }

        // Run in flee direction at flee speed
        body.velocity.x = this.fleeDirection.x * this.fleeSpeed
        body.velocity.z = this.fleeDirection.z * this.fleeSpeed
        this.isWalking = true

        // Face flee direction
        const mesh = this.getMesh()
        if (mesh && (this.fleeDirection.x !== 0 || this.fleeDirection.z !== 0)) {
          mesh.rotation.y = Math.atan2(this.fleeDirection.x, this.fleeDirection.z)
        }
      }

      // Update last position and animations
      this.lastPosition.copy(this.position)
      this.updateAnimations(deltaTime)
      return
    }

    // Update wander cooldown
    this.wanderCooldown -= deltaTime

    // Check if we need a new wander target
    if (this.wanderCooldown <= 0) {
      this.pickNewWanderTarget()
      this.wanderCooldown = this.randomRange(this.wanderMinInterval, this.wanderMaxInterval)
    }

    // Move toward wander target
    const body = this.getPhysicsBody()
    if (this.wanderTarget && body) {
      this.wanderDirection.copy(this.wanderTarget).sub(this.position)
      this.wanderDirection.y = 0 // Only move horizontally

      const distance = this.wanderDirection.length()

      if (distance > 0.5) {
        this.wanderDirection.normalize()

        // Jump 1-block obstacles; if a jump didn't clear it, the obstacle is
        // too high - pick a new direction
        if (this.handleObstacleWhileMoving(body, this.wanderDirection, this.walkSpeed, deltaTime)) {
          this.pickNewWanderTarget()
        }

        // Still moving toward target - set velocity on physics body
        body.velocity.x = this.wanderDirection.x * this.walkSpeed
        body.velocity.z = this.wanderDirection.z * this.walkSpeed
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

  /**
   * Shared obstacle handling for any intentional movement (wandering AND
   * fleeing): while walking, detect lack of progress along the desired
   * direction, first try a jump to clear a 1-block obstacle, and report when
   * the jump didn't help so the caller can change course.
   *
   * @param desiredDirection Normalized horizontal movement direction
   * @param speed Intended movement speed (blocks/s)
   * @returns True when the entity is still stuck after a jump attempt
   *          (obstacle too high) - the caller should pick a new direction
   */
  private handleObstacleWhileMoving(
    body: IPhysicsBody,
    desiredDirection: THREE.Vector3,
    speed: number,
    deltaTime: number
  ): boolean {
    const actualMoveX = this.position.x - this.lastPosition.x
    const actualMoveZ = this.position.z - this.lastPosition.z
    const movementInDirection =
      actualMoveX * desiredDirection.x + actualMoveZ * desiredDirection.z
    const expectedMovement = speed * deltaTime

    // Stuck if we're not making progress in our intended direction
    if (this.isWalking && movementInDirection < expectedMovement * DEFAULT_STUCK_MOVEMENT_RATIO) {
      this.stuckTime += deltaTime

      if (this.stuckTime >= DEFAULT_STUCK_TIME_THRESHOLD) {
        if (!this.hasTriedJump && body.isOnGround) {
          // Try jumping over 1-block obstacle
          body.velocity.y = this.jumpVelocity
          this.hasTriedJump = true
          this.stuckTime = 0
        } else if (body.isOnGround && this.hasTriedJump) {
          // We landed and are still stuck - the jump didn't clear it
          this.hasTriedJump = false
          this.stuckTime = 0
          return true
        }
        // Otherwise we're mid-air after a jump - wait until we land
      }
    } else {
      // We're moving, reset stuck tracking
      this.stuckTime = 0
      if (body.isOnGround) {
        this.hasTriedJump = false
      }
    }

    return false
  }

  private pickNewWanderTarget(): void {
    // Pick a random direction and distance
    const angle = Math.random() * Math.PI * 2
    const distance = this.randomRange(this.wanderMinDistance, this.wanderMaxDistance)

    this.wanderTarget = new THREE.Vector3(
      this.position.x + Math.cos(angle) * distance,
      this.position.y,
      this.position.z + Math.sin(angle) * distance
    )
  }

  onSpawn(): void {
    // Initialize last position for stuck detection
    this.lastPosition.copy(this.position)
  }

  /**
   * Check if player can interact with this entity.
   */
  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    const dist = this.position.distanceTo(playerPosition)
    return dist <= maxDistance
  }

  /**
   * Get items dropped when this entity dies.
   * Uses the drops configuration to generate items with random counts.
   * Only returns drops once per entity death.
   */
  getDrops(): IItem[] {
    // Only return drops once
    if (this.dropsCollected) {
      return []
    }
    this.dropsCollected = true

    const result: IItem[] = []

    for (const drop of this.drops) {
      const minCount = drop.minCount ?? 1
      const maxCount = drop.maxCount ?? minCount
      const count = Math.floor(this.randomRange(minCount, maxCount + 1))

      for (let i = 0; i < count; i++) {
        result.push(drop.createItem())
      }
    }

    return result
  }

  /**
   * Handle player hitting this entity.
   */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick) return false
    if (!this.isAlive) return false

    // Calculate damage from held item
    let damage = DEFAULT_BASE_DAMAGE
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
      // Player is exactly on entity, pick random direction
      knockbackDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }

    // Apply knockback to physics body
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = knockbackDir.x * this.knockbackHorizontal
      body.velocity.z = knockbackDir.z * this.knockbackHorizontal
      body.velocity.y = this.knockbackVertical
    }

    // Check death - start death animation instead of immediate kill
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      // Clear other states
      this.knockbackTimer = 0
      this.fleeTimer = 0
    } else {
      // Only set flee/knockback if not dying
      this.knockbackTimer = this.knockbackStunTime
      this.fleeTimer = this.fleeDuration
      this.fleeDirection.copy(knockbackDir)
    }

    return true
  }

  dispose(): void {
    this.wanderTarget = null
    super.dispose()
  }
}
