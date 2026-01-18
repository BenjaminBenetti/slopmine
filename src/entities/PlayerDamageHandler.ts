import * as THREE from 'three'
import type { PlayerHealth } from '../player/PlayerHealth.ts'
import type { HealthDisplayUI } from '../ui/HealthDisplay.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { CameraControls } from '../player/FirstPersonCameraControls.ts'

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
   * @param damage - Amount of damage to apply
   * @param knockback - Optional knockback vector to apply to player
   */
  damage(damage: number, knockback?: THREE.Vector3): void {
    this.playerHealth.takeDamage(damage)
    this.healthDisplay.flash()

    if (knockback) {
      this.cameraControls.applyKnockback(knockback)
    }
  }

  /**
   * Creates a callback function that entities can use for damage.
   * This is useful for entities that use the callback pattern.
   */
  createCallback(): (damage: number, knockback: THREE.Vector3) => void {
    return (damage: number, knockback: THREE.Vector3) => {
      this.damage(damage, knockback)
    }
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
