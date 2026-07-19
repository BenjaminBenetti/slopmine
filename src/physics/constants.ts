/** Gravity acceleration in blocks per second squared */
export const GRAVITY = -28.0

/** Terminal velocity (max falling speed) in blocks per second */
export const TERMINAL_VELOCITY = -78.4

/** Jump velocity in blocks per second (~1.25 block jump height) */
export const JUMP_VELOCITY = 9.0

/** Climbing velocity in blocks per second */
export const CLIMB_VELOCITY = 4.0

/** Player hitbox dimensions (Minecraft standard) */
export const PLAYER_WIDTH = 0.6
export const PLAYER_HEIGHT = 1.8
export const PLAYER_DEPTH = 0.6

/** Eye height offset from feet position */
export const EYE_HEIGHT = 1.62

/** Small epsilon for floating point comparisons */
// Maximum ledge height the player walks up without jumping (slabs, stairs)
export const STEP_HEIGHT = 0.55

export const EPSILON = 0.001

/** Fall damage threshold in blocks (no damage below this) */
export const FALL_DAMAGE_THRESHOLD = 6.0

/** Damage per block fallen above threshold */
export const FALL_DAMAGE_PER_BLOCK = 1.0

/** Invincibility duration in seconds after taking damage */
export const INVINCIBILITY_DURATION = 1.0
