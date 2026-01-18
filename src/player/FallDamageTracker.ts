import {
  FALL_DAMAGE_THRESHOLD,
  FALL_DAMAGE_PER_BLOCK,
} from '../physics/constants.ts'

/**
 * Calculates fall damage based on fall distance.
 * @param fallDistance - Distance fallen in blocks
 * @returns Damage amount (0 if below threshold)
 */
export function calculateFallDamage(fallDistance: number): number {
  if (fallDistance <= FALL_DAMAGE_THRESHOLD) {
    return 0
  }
  return Math.floor(fallDistance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_BLOCK
}

/**
 * Tracks fall state and calculates damage on landing.
 * Monitors highest Y position while airborne and computes
 * damage when the player lands.
 */
export class FallDamageTracker {
  private highestY: number = 0
  private wasInAir: boolean = false

  /**
   * Updates fall tracking state and returns damage if player just landed.
   * Call this each frame after physics update.
   *
   * @param currentY - Current Y position of player
   * @param isOnGround - Whether player is currently on ground
   * @returns Damage to apply (0 if no landing or safe landing)
   */
  update(currentY: number, isOnGround: boolean): number {
    if (!isOnGround) {
      // Player is in the air
      this.wasInAir = true
      if (currentY > this.highestY) {
        this.highestY = currentY
      }
      return 0
    }

    // Player is on ground
    if (!this.wasInAir) {
      // Wasn't in air, no fall damage possible
      return 0
    }

    // Just landed - calculate damage
    const fallDistance = this.highestY - currentY
    const damage = calculateFallDamage(fallDistance)

    // Reset tracking for next fall
    this.wasInAir = false
    this.highestY = currentY

    return damage
  }

  /**
   * Resets the tracker state.
   * Call this when teleporting the player to avoid false fall damage.
   */
  reset(currentY: number): void {
    this.highestY = currentY
    this.wasInAir = false
  }
}
