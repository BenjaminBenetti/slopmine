import { weatherAt } from '../../weather/WeatherHooks.ts'

/** Seconds after its weather leaves before a weather creature starts to go (random in this range). */
const RETREAT_DELAY: readonly [number, number] = [3, 18]
/** The weather around a creature is checked this often (seconds). */
const CHECK_INTERVAL = 1

/**
 * Weather creatures come with their weather and go with it: once the weather
 * where a creature stands is none of its own (the storm passed, the fog
 * lifted), it waits a random few seconds, plays its own exit (the cloud
 * thins away, the whirlwind collapses into sand, the stalker melts into the
 * snow...) and removes itself without dropping anything. The weather-creature
 * counterpart of DawnRetreat (entities/night/NightCreature.ts).
 *
 * Usage in a creature's update():
 *
 * ```ts
 * const exit = this.retreat.update(deltaTime, this.position.x, this.position.y, this.position.z)
 * if (exit > 0) {
 *   // animate the exit with `exit` going 0 → 1, then
 *   if (exit >= 1) this.kill()
 *   return
 * }
 * ```
 *
 * and `canPlayerInteract` returns false while `retreat.leaving`.
 */
export class WeatherRetreat {
  private delay = -1
  private progress = 0
  private sinceCheck = CHECK_INTERVAL
  private inWeather = true

  /**
   * @param weathers the WeatherCatalog ids this creature belongs to
   * @param duration seconds the exit animation takes
   */
  constructor(private readonly weathers: ReadonlySet<string>, private readonly duration: number = 1.6) {}

  /** Exit progress 0-1 (0 = still hunting; 1 = gone, remove the creature). */
  update(deltaTime: number, x: number, y: number, z: number): number {
    if (this.progress > 0) {
      this.progress = Math.min(1, this.progress + deltaTime / this.duration)
      return this.progress
    }
    this.sinceCheck += deltaTime
    if (this.sinceCheck >= CHECK_INTERVAL) {
      this.sinceCheck = 0
      this.inWeather = this.weathers.has(weatherAt(x, y, z))
    }
    if (this.inWeather) {
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

  /** Begin the exit now. */
  leaveNow(): void {
    if (this.progress === 0) this.progress = 1e-3
  }
}
