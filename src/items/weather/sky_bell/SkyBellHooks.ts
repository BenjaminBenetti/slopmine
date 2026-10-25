/**
 * What the Sky Bell item needs from the running game: where the player is
 * (the bell rings the weather around them). The weather setup registers a
 * position source at startup; until then the bell does nothing.
 */

export interface SkyBellPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

let positionSource: (() => SkyBellPosition) | null = null

export function setSkyBellPositionSource(source: (() => SkyBellPosition) | null): void {
  positionSource = source
}

export function getSkyBellPosition(): SkyBellPosition | null {
  return positionSource ? positionSource() : null
}

/** Seconds a rung bell rests before it can be rung again. */
export const SKY_BELL_COOLDOWN = 300

/** Real-time clock (ms) the bell was last rung, null = never this session. */
let lastRungAt: number | null = null

/** Seconds of cooldown left (0 = ready). */
export function skyBellCooldownRemaining(now: number = performance.now()): number {
  if (lastRungAt === null) return 0
  return Math.max(0, SKY_BELL_COOLDOWN - (now - lastRungAt) / 1000)
}

export function markSkyBellRung(now: number = performance.now()): void {
  lastRungAt = now
}
