import * as THREE from 'three'
import type { PlayerHealth } from '../player/PlayerHealth.ts'
import type { HealthDisplayUI } from '../ui/HealthDisplay.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { CameraControls } from '../player/FirstPersonCameraControls.ts'
import { applyDamageModifiers, type DamageSource } from '../player/DamageModifiers.ts'

/**
 * Centralized handler for applying damage to the player.
 * Entities can use this to easily damage the player without needing
 * to manage callbacks themselves.
 */
export class PlayerDamageHandler {
  private playerHealth: PlayerHealth
  private healthDisplay: HealthDisplayUI
  private playerBody: IPhysicsBody
  private cameraControls: CameraControls

  constructor(
    playerHealth: PlayerHealth,
    healthDisplay: HealthDisplayUI,
    playerBody: IPhysicsBody,
    cameraControls: CameraControls
  ) {
    this.playerHealth = playerHealth
    this.healthDisplay = healthDisplay
    this.playerBody = playerBody
    this.cameraControls = cameraControls
  }

  /**
   * Apply damage to the player with optional knockback.
   * The amount first runs through the damage modifiers (armor, potions...).
   * A hit landing while the player is dead or still invincible from an
   * earlier hit (i-frames) is absorbed whole - no damage, no knockback - so
   * the projectiles of one volley arriving together knock back like one hit.
   * @param damage - Amount of damage to apply
   * @param knockback - Optional knockback vector to apply to player
   * @param source - What dealt the damage (default 'melee')
   * @returns false when the hit was absorbed whole (dead or invincible)
   */
  damage(damage: number, knockback?: THREE.Vector3, source: DamageSource = 'melee'): boolean {
    if (this.playerHealth.isDead || this.playerHealth.isInvincible) return false

    const amount = applyDamageModifiers(damage, source)
    if (amount > 0) {
      this.playerHealth.takeDamage(amount)
      this.healthDisplay.flash()
    }

    if (knockback) {
      this.cameraControls.applyKnockback(knockback)
    }
    return true
  }

  /**
   * Creates a callback function that entities can use for damage.
   * This is useful for entities that use the callback pattern.
   */
  createCallback(): (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean {
    return (damage: number, knockback: THREE.Vector3, source?: DamageSource) =>
      this.damage(damage, knockback, source)
  }

  /**
   * Get the player's current position for distance checks.
   */
  getPlayerPosition(): THREE.Vector3 {
    return this.playerBody.position
  }

  /**
   * Check if player is within range of a position.
   */
  isPlayerInRange(position: THREE.Vector3, range: number): boolean {
    const dx = this.playerBody.position.x - position.x
    const dy = this.playerBody.position.y - position.y
    const dz = this.playerBody.position.z - position.z
    return (dx * dx + dy * dy + dz * dz) < (range * range)
  }
}
