/**
 * The Return Idol item's link to the system that runs it (cooldown, channel
 * interruption, teleport): the item stays a plain data class, the controller
 * (src/player/returnidol/) registers itself here at startup.
 */
export interface ReturnIdolHandler {
  /** Checked every tick while the use button is held; false cancels the channel. */
  canUse(): boolean
  /** The channel completed: teleport home. */
  activate(): void
}

let handler: ReturnIdolHandler | null = null

export function setReturnIdolHandler(next: ReturnIdolHandler | null): void {
  handler = next
}

export function canUseReturnIdol(): boolean {
  return handler?.canUse() ?? false
}

export function activateReturnIdol(): void {
  handler?.activate()
}

/** Seconds the right button must be held to channel the idol. */
export const RETURN_IDOL_CHANNEL_SECONDS = 3.0
