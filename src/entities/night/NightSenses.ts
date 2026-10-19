/**
 * What night creatures can sense about the player beyond the usual entity
 * wiring (position, damage callback, block queries): where the player is
 * looking (the Stillwatcher freezes under a gaze), whether they carry or
 * stand in light (dusk moths are drawn to it) - plus setting the player
 * alight (the Ashwalker's blow). setupNightfall registers the providers;
 * until then (workers, tests, previews) every query answers "nothing".
 */

export interface PlayerGaze {
  /** Eye position (world). */
  readonly origin: { readonly x: number; readonly y: number; readonly z: number }
  /** Unit view direction. */
  readonly direction: { readonly x: number; readonly y: number; readonly z: number }
}

export interface NightSensesProvider {
  getPlayerGaze(): PlayerGaze | null
  /** The selected hotbar item gives off light (a torch, a lantern...). */
  isPlayerCarryingLight(): boolean
  /** Block light (0-15) at a world position. */
  getBlockLight(x: number, y: number, z: number): number
  /** Set the player burning for `ticks` 1-second ticks (2 fire damage each). */
  ignitePlayer(ticks: number): void
}

let provider: NightSensesProvider | null = null

export function registerNightSenses(p: NightSensesProvider | null): void {
  provider = p
}

export function getPlayerGaze(): PlayerGaze | null {
  return provider?.getPlayerGaze() ?? null
}

export function isPlayerCarryingLight(): boolean {
  return provider?.isPlayerCarryingLight() ?? false
}

export function getBlockLight(x: number, y: number, z: number): number {
  return provider?.getBlockLight(x, y, z) ?? 0
}

export function ignitePlayer(ticks: number): void {
  provider?.ignitePlayer(ticks)
}
