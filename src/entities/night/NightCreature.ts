import type * as THREE from 'three'
import { worldClock } from '../../daynight/WorldClock.ts'

/** Seconds after sunrise before a night creature starts to leave (random in this range). */
const RETREAT_DELAY: readonly [number, number] = [2, 24]

/**
 * Night creatures don't burn at dawn - they leave. Once the sun is up, each
 * one waits a random few seconds (so they don't all vanish at once), then
 * plays its own exit (the scarecrow slumps into straw, the moth flies off,
 * the stag dissolves into mist...) and removes itself without dropping
 * anything.
 *
 * Usage in a creature's update():
 *
 * ```ts
 * const exit = this.dawn.update(deltaTime)
 * if (exit > 0) {
 *   // animate the exit with `exit` going 0 → 1, then
 *   if (exit >= 1) this.kill()
 *   return
 * }
 * ```
 *
 * and `canPlayerInteract` returns false while `dawn.leaving`.
 */
export class DawnRetreat {
  private delay = -1
  private progress = 0

  /** @param duration seconds the exit animation takes */
  constructor(private readonly duration: number = 1.6) {}

  /** Exit progress 0-1 (0 = still hunting; 1 = gone, remove the creature). */
  update(deltaTime: number): number {
    if (this.progress > 0) {
      this.progress = Math.min(1, this.progress + deltaTime / this.duration)
      return this.progress
    }
    if (worldClock.isNight) {
      this.delay = -1
      return 0
    }
    if (this.delay < 0) this.delay = RETREAT_DELAY[0] + Math.random() * (RETREAT_DELAY[1] - RETREAT_DELAY[0])
    this.delay -= deltaTime
    if (this.delay <= 0) this.progress = Math.min(1, deltaTime / this.duration) || 1e-3
    return this.progress
  }

  /** The exit has begun: no more attacks, and the player can't hit it. */
  get leaving(): boolean {
    return this.progress > 0
  }

  /** Begin the exit now (e.g. a creature that lost its target at daybreak). */
  leaveNow(): void {
    if (this.progress === 0) this.progress = 1e-3
  }
}

/**
 * Fade materials to `opacity` (0-1 of their own `baseOpacity`), switching
 * them to transparent on the way. For exits that dissolve a creature.
 */
export function fadeMaterials(materials: readonly THREE.Material[], opacity: number, baseOpacity: ReadonlyMap<THREE.Material, number> | null = null): void {
  for (const m of materials) {
    if (!m.transparent) {
      m.transparent = true
      m.needsUpdate = true
    }
    m.opacity = (baseOpacity?.get(m) ?? 1) * opacity
    m.depthWrite = opacity > 0.98
  }
}
