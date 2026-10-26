/**
 * The water's particle effects as hooks (splashes, bubbles, wakes), so the
 * things that make them - the player, mobs, boats, fish - never import the
 * renderer. No-ops until setupWater registers the particle system (and in
 * workers and tests).
 */
export interface WaterEffectsSink {
  splash(x: number, surfaceY: number, z: number, strength: number): void
  bubbles(x: number, y: number, z: number, surfaceY: number, count: number): void
  wake(x: number, surfaceY: number, z: number, dirX: number, dirZ: number, speed: number): void
}

let sink: WaterEffectsSink | null = null

export function setWaterEffects(effects: WaterEffectsSink | null): void {
  sink = effects
}

/** Something hit the water at (x, surfaceY, z) (`strength` 0-1+: a pebble to a cannonball). */
export function waterSplash(x: number, surfaceY: number, z: number, strength: number): void {
  sink?.splash(x, surfaceY, z, strength)
}

/** Bubbles from (x, y, z) rising to the surface at `surfaceY`. */
export function waterBubbles(x: number, y: number, z: number, surfaceY: number, count: number): void {
  sink?.bubbles(x, y, z, surfaceY, count)
}

/** Foam behind something moving on the surface toward (dirX, dirZ) at `speed` blocks/s. */
export function waterWake(x: number, surfaceY: number, z: number, dirX: number, dirZ: number, speed: number): void {
  sink?.wake(x, surfaceY, z, dirX, dirZ, speed)
}
