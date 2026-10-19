/**
 * Sleeping through the night: the bed calls `requestSleep()`; the night
 * system (setupNightfall) registers what that does - refuse while a night
 * creature prowls close by, otherwise fade out and skip to morning. Until it
 * registers (tests), nobody sleeps.
 */

export type SleepResult =
  /** Fell asleep: the night is skipped. */
  | 'slept'
  /** Not night: nothing to sleep through (the bed still sets the spawn point). */
  | 'day'
  /** A night creature is too close to sleep. */
  | 'unsafe'

let sleepHandler: (() => SleepResult) | null = null

export function registerSleepHandler(handler: (() => SleepResult) | null): void {
  sleepHandler = handler
}

export function requestSleep(): SleepResult {
  return sleepHandler?.() ?? 'day'
}
