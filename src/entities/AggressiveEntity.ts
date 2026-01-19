import * as THREE from 'three'
import { PeacefulEntity } from './PeacefulEntity.ts'
import type { IAggressiveEntityConfig } from './interfaces/IAggressiveEntityConfig.ts'
import { AggressionMode } from './interfaces/IAggressiveEntityConfig.ts'
import type { IItem } from '../items/Item.ts'

// Default aggressive behavior constants
const DEFAULT_DETECTION_RANGE = 16.0 // blocks
const DEFAULT_CHASE_SPEED = 5.0 // blocks per second
const DEFAULT_ATTACK_RANGE = 2.0 // blocks
const DEFAULT_ATTACK_COOLDOWN = 1.5 // seconds
const DEFAULT_ATTACK_DAMAGE = 4 // 2 hearts
const DEFAULT_ATTACK_KNOCKBACK_HORIZONTAL = 4.0 // blocks/sec
const DEFAULT_ATTACK_KNOCKBACK_VERTICAL = 3.0 // blocks/sec
const DEFAULT_AGGRO_TIMEOUT = 5.0 // seconds to lose interest
const DEFAULT_PROVOKED_DURATION = 10.0 // seconds of aggression when provoked

// Damage constants
const DEFAULT_BASE_DAMAGE = 2 // Fist damage

// Stuck detection constants for chase behavior
const CHASE_STUCK_MOVEMENT_RATIO = 0.2 // If moving less than 20% of expected, we're stuck
const CHASE_STUCK_TIME_THRESHOLD = 0.3 // Seconds of being stuck before jumping

/**
 * Base class for aggressive/hostile entities that attack the player.
 * Extends PeacefulEntity to reuse wandering, health, knockback, and death animation.
 *
 * Supports two aggression modes:
 * - ALWAYS_AGGRESSIVE: Attacks player on sight (zombies, spiders)
 * - AGGRESSIVE_WHEN_PROVOKED: Only attacks after being hit (alligators, wolves)
 *
 * Subclasses should:
 * 1. Override createMesh() to provide their visual representation
 * 2. Override updateAnimations() for entity-specific animations
 * 3. Optionally override performAttack() for custom attack effects
 * 4. Optionally override onAggressionStateChanged() for sounds/visuals
 */
export abstract class AggressiveEntity extends PeacefulEntity {
  // Configuration (from constructor)
  protected readonly aggressionMode: AggressionMode
  protected readonly detectionRange: number
  protected readonly chaseSpeed: number
  protected readonly attackRange: number
  protected readonly attackCooldownDuration: number
  protected readonly attackDamage: number
  protected readonly attackKnockbackHorizontal: number
  protected readonly attackKnockbackVertical: number
  protected readonly aggroTimeout: number
  protected readonly provokedDuration: number

  // Aggression state
  protected isAggressive = false
  protected aggressiveTimer = 0
  protected attackCooldown = 0

  // Player references
  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null

  // Reusable vectors to avoid allocation
  private readonly chaseDirection = new THREE.Vector3()
  private readonly knockbackDirection = new THREE.Vector3()

  // Stuck detection for chase behavior
  private readonly lastChasePosition = new THREE.Vector3()
  private chaseStuckTime = 0
  private chaseHasTriedJump = false

  constructor(type: string, config: IAggressiveEntityConfig) {
    // Disable flee behavior for aggressive entities
    super(type, {
      ...config,
      fleeSpeed: 0,
      fleeDuration: 0,
    })

    // Apply aggressive configuration with defaults
    this.aggressionMode = config.aggressionMode ?? AggressionMode.ALWAYS_AGGRESSIVE
    this.detectionRange = config.detectionRange ?? DEFAULT_DETECTION_RANGE
    this.chaseSpeed = config.chaseSpeed ?? DEFAULT_CHASE_SPEED
    this.attackRange = config.attackRange ?? DEFAULT_ATTACK_RANGE
    this.attackCooldownDuration = config.attackCooldown ?? DEFAULT_ATTACK_COOLDOWN
    this.attackDamage = config.attackDamage ?? DEFAULT_ATTACK_DAMAGE
    this.attackKnockbackHorizontal = config.attackKnockbackHorizontal ?? DEFAULT_ATTACK_KNOCKBACK_HORIZONTAL
    this.attackKnockbackVertical = config.attackKnockbackVertical ?? DEFAULT_ATTACK_KNOCKBACK_VERTICAL
    this.aggroTimeout = config.aggroTimeout ?? DEFAULT_AGGRO_TIMEOUT
    this.provokedDuration = config.provokedDuration ?? DEFAULT_PROVOKED_DURATION
  }

  /**
   * Set the player position reference for continuous tracking while aggressive.
   * Called by EntityManager when the entity is registered.
   */
  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  /**
   * Set the callback for when the entity attacks the player.
   * Called by EntityManager when the entity is registered.
   */
  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    this.playerDamageCallback = callback
  }

  /**
   * Check if the player is within detection range.
   */
  private isPlayerInRange(): boolean {
    if (!this.playerPositionRef) return false
    const distance = this.position.distanceTo(this.playerPositionRef)
    return distance <= this.detectionRange
  }

  /**
   * Get the distance to the player.
   */
  private getDistanceToPlayer(): number {
    if (!this.playerPositionRef) return Infinity
    return this.position.distanceTo(this.playerPositionRef)
  }

  /**
   * Update aggression state based on mode and player distance.
   */
  private updateAggressionState(deltaTime: number): void {
    const playerInRange = this.isPlayerInRange()

    if (this.aggressionMode === AggressionMode.ALWAYS_AGGRESSIVE) {
      // Always aggressive: become hostile when player is in range
      if (playerInRange && !this.isAggressive) {
        this.setAggressive(true)
      }

      // Reset timer while player is in range
      if (this.isAggressive && playerInRange) {
        this.aggressiveTimer = this.aggroTimeout
      }
    }

    // Countdown timer while aggressive
    if (this.isAggressive) {
      if (!playerInRange) {
        this.aggressiveTimer -= deltaTime
      }

      // Lose aggro when timer expires
      if (this.aggressiveTimer <= 0) {
        this.setAggressive(false)
      }
    }
  }

  /**
   * Set the aggressive state and notify subclasses.
   */
  private setAggressive(aggressive: boolean): void {
    if (this.isAggressive === aggressive) return

    this.isAggressive = aggressive
    if (aggressive) {
      this.aggressiveTimer = this.aggressionMode === AggressionMode.AGGRESSIVE_WHEN_PROVOKED
        ? this.provokedDuration
        : this.aggroTimeout
    }
    this.onAggressionStateChanged(aggressive)
  }

  /**
   * Chase the player.
   */
  private chasePlayer(deltaTime: number): void {
    if (!this.playerPositionRef) return

    const body = this.getPhysicsBody()
    if (!body) return

    // Calculate direction to player
    this.chaseDirection.copy(this.playerPositionRef).sub(this.position)
    this.chaseDirection.y = 0
    const distance = this.chaseDirection.length()

    if (distance > 0.1) {
      this.chaseDirection.normalize()
    }

    if (distance <= this.attackRange) {
      // Stop moving when in attack range
      body.velocity.x = 0
      body.velocity.z = 0
      this.isWalking = false

      // Reset stuck state when in attack range
      this.chaseStuckTime = 0
      this.chaseHasTriedJump = false

      // Attack if cooldown is ready
      if (this.attackCooldown <= 0) {
        this.performAttack()
        this.attackCooldown = this.attackCooldownDuration
      }
    } else {
      // Check if we're stuck (trying to move but not making progress)
      const actualMoveX = this.position.x - this.lastChasePosition.x
      const actualMoveZ = this.position.z - this.lastChasePosition.z
      const movementInDirection =
        actualMoveX * this.chaseDirection.x + actualMoveZ * this.chaseDirection.z
      const expectedMovement = this.chaseSpeed * deltaTime

      // Stuck if we're not making progress in our intended direction
      if (this.isWalking && movementInDirection < expectedMovement * CHASE_STUCK_MOVEMENT_RATIO) {
        this.chaseStuckTime += deltaTime

        if (this.chaseStuckTime >= CHASE_STUCK_TIME_THRESHOLD) {
          if (!this.chaseHasTriedJump && body.isOnGround) {
            // Try jumping over 1-block obstacle
            body.velocity.y = this.jumpVelocity
            this.chaseHasTriedJump = true
            this.chaseStuckTime = 0
          } else if (this.chaseHasTriedJump && body.isOnGround) {
            // We landed and are still stuck - reset and try again
            this.chaseHasTriedJump = false
            this.chaseStuckTime = 0
          }
        }
      } else {
        // We're making progress, reset stuck tracking
        this.chaseStuckTime = 0
        if (body.isOnGround) {
          this.chaseHasTriedJump = false
        }
      }

      // Chase at aggressive speed
      body.velocity.x = this.chaseDirection.x * this.chaseSpeed
      body.velocity.z = this.chaseDirection.z * this.chaseSpeed
      this.isWalking = true
    }

    // Update last position for stuck detection
    this.lastChasePosition.copy(this.position)

    // Face movement direction
    const mesh = this.getMesh()
    if (mesh && (this.chaseDirection.x !== 0 || this.chaseDirection.z !== 0)) {
      mesh.rotation.y = Math.atan2(this.chaseDirection.x, this.chaseDirection.z)
    }
  }

  /**
   * Perform an attack on the player.
   * Subclasses can override for custom attack effects (animations, sounds).
   */
  protected performAttack(): void {
    if (!this.playerPositionRef || !this.playerDamageCallback) return

    // Calculate knockback direction (away from entity toward player)
    this.knockbackDirection.copy(this.playerPositionRef).sub(this.position)
    this.knockbackDirection.y = 0
    if (this.knockbackDirection.lengthSq() > 0) {
      this.knockbackDirection.normalize()
    }

    // Apply horizontal and vertical knockback
    this.knockbackDirection.multiplyScalar(this.attackKnockbackHorizontal)
    this.knockbackDirection.y = this.attackKnockbackVertical

    // Call player damage callback
    this.playerDamageCallback(this.attackDamage, this.knockbackDirection)
  }

  /**
   * Called when aggression state changes.
   * Subclasses can override for sounds or visual effects.
   */
  protected onAggressionStateChanged(_isAggressive: boolean): void {
    // Default: no-op. Subclasses can override.
  }

  update(deltaTime: number): void {
    // Handle death animation (from parent)
    if (this._isDying) {
      super.update(deltaTime)
      return
    }

    // Handle knockback stun - skip AI while stunned but sync position
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime

      // Sync position from physics body during knockback
      const body = this.getPhysicsBody()
      const mesh = this.getMesh()
      if (body) {
        this.position.copy(body.position)
      }
      if (mesh) {
        mesh.position.copy(this.position)
      }

      this.updateAnimations(deltaTime)
      return
    }

    // Update attack cooldown
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)

    // Update aggression state
    this.updateAggressionState(deltaTime)

    // Handle aggressive behavior
    if (this.isAggressive) {
      this.chasePlayer(deltaTime)
      this.updateAnimations(deltaTime)

      // Sync position from physics body (aggressive mode bypasses parent update)
      const body = this.getPhysicsBody()
      const mesh = this.getMesh()
      if (body) {
        this.position.copy(body.position)
      }
      if (mesh) {
        mesh.position.copy(this.position)
      }

      return
    }

    // Not aggressive - use parent wandering behavior
    super.update(deltaTime)
  }

  /**
   * Override onPlayerInteract to trigger provocation for AGGRESSIVE_WHEN_PROVOKED mode.
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
      knockbackDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }

    // Apply knockback to physics body
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = knockbackDir.x * this.knockbackHorizontal
      body.velocity.z = knockbackDir.z * this.knockbackHorizontal
      body.velocity.y = this.knockbackVertical
    }

    // Check death
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.knockbackTimer = 0
      this.isAggressive = false
      this.aggressiveTimer = 0
    } else {
      // Trigger aggression (applies to both modes - if hit, become aggressive)
      this.knockbackTimer = this.knockbackStunTime
      this.setAggressive(true)
    }

    return true
  }

  dispose(): void {
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.isAggressive = false
    super.dispose()
  }
}
