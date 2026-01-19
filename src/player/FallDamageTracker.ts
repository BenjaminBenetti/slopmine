import {
  FALL_DAMAGE_THRESHOLD,
  FALL_DAMAGE_PER_BLOCK,
  GRAVITY,
} from '../physics/constants.ts'

/**
 * Velocity threshold for fall damage (derived from 6 block fall).
 * Using v² = 2gh: v = sqrt(2 * 28 * 6) ≈ 18.33 blocks/second
 */
const FALL_DAMAGE_VELOCITY_THRESHOLD = Math.sqrt(
  2 * Math.abs(GRAVITY) * FALL_DAMAGE_THRESHOLD
)

/**
 * Calculates fall damage based on impact velocity.
 * @param impactVelocity - Downward velocity at impact (positive = falling down)
 * @returns Damage amount (0 if below threshold)
 */
export function calculateFallDamage(impactVelocity: number): number {
  if (impactVelocity <= FALL_DAMAGE_VELOCITY_THRESHOLD) {
    return 0
  }
  // Convert velocity to equivalent fall distance: h = v² / (2g)
  const equivalentDistance =
    (impactVelocity * impactVelocity) / (2 * Math.abs(GRAVITY))
  return (
    Math.floor(equivalentDistance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_BLOCK
  )
}

/**
 * Tracks fall state and calculates damage on landing.
 * Uses impact velocity to determine damage, which correctly handles
 * cases like exiting flying/noclip mode.
 */
export class FallDamageTracker {
  private wasInAir: boolean = false
  private lastVelocityY: number = 0

  /**
   * Updates fall tracking state and returns damage if player just landed.
   * Call this each frame after physics update.
   *
   * @param velocityY - Current Y velocity (negative = falling)
   * @param isOnGround - Whether player is currently on ground
   * @returns Damage to apply (0 if no landing or safe landing)
   */
  update(velocityY: number, isOnGround: boolean): number {
    if (!isOnGround) {
      // Player is in the air - track velocity
      this.wasInAir = true
      this.lastVelocityY = velocityY
      return 0
    }

    // Player is on ground
    if (!this.wasInAir) {
      // Wasn't in air, no fall damage possible
      this.lastVelocityY = 0
      return 0
    }

    // Just landed - calculate damage based on impact velocity
    // lastVelocityY is negative when falling, so negate it
    const impactSpeed = Math.max(0, -this.lastVelocityY)
    const damage = calculateFallDamage(impactSpeed)

    // Reset tracking for next fall
    this.wasInAir = false
    this.lastVelocityY = 0

    return damage
  }

  /**
   * Resets the tracker state.
   * Call this when teleporting the player to avoid false fall damage.
   */
  reset(): void {
    this.wasInAir = false
    this.lastVelocityY = 0
  }
}
