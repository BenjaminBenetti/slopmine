/**
 * The overworld's time of day. One cycle is 20 real minutes: 12 for the day
 * (06:00 → 18:00) and 8 for the night (18:00 → 06:00), so night hours pass
 * faster than day hours. The sun rises in the east (+X), crosses the sky a
 * little south of overhead (+Z) and sets in the west; the moon is opposite.
 *
 * The clock runs everywhere (Hell included) but only the surface sees it:
 * the sky, the light, the night creatures. Pure data - no three.js, so
 * entities, the spawner and tests can read it freely.
 */

/** Real seconds from 06:00 to 18:00. */
export const DAY_SECONDS = 720
/** Real seconds from 18:00 to 06:00. */
export const NIGHT_SECONDS = 480
export const CYCLE_SECONDS = DAY_SECONDS + NIGHT_SECONDS

/** Where a new world (or a save from before the clock) starts: early morning. */
export const NEW_WORLD_HOUR = 7

/** Night begins once the sun is this far below the horizon (≈ -7°, about 18:27). */
const NIGHT_START_ELEVATION = -0.12
/** ...and ends at sunrise (≈ 06:05). */
const NIGHT_END_ELEVATION = 0.02

/** Southward tilt of the sun's path (matches the old fixed 10am sun). */
const SUN_TILT_Z = 1 / 3
/** The moon sits a little north of opposite the sun. */
const MOON_TILT_Z = -0.25

export interface Vec3Like {
  x: number
  y: number
  z: number
}

/** Hour of day (0-24) for seconds since 06:00. */
export function hourAt(cycleTime: number): number {
  const t = ((cycleTime % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS
  const hour = t < DAY_SECONDS ? 6 + (t / DAY_SECONDS) * 12 : 18 + ((t - DAY_SECONDS) / NIGHT_SECONDS) * 12
  return hour % 24
}

/** Seconds since 06:00 for an hour of day (0-24). */
export function cycleTimeAt(hour: number): number {
  const h = (((hour - 6) % 24) + 24) % 24
  return h < 12 ? (h / 12) * DAY_SECONDS : DAY_SECONDS + ((h - 12) / 12) * NIGHT_SECONDS
}

/** Unit direction toward the sun at an hour of day (below the horizon at night). */
export function sunDirectionAt(hour: number, out: Vec3Like): Vec3Like {
  const angle = ((hour - 6) / 12) * Math.PI
  return normalizeInto(out, Math.cos(angle), Math.sin(angle), SUN_TILT_Z)
}

/** Unit direction toward the moon at an hour of day (overhead at midnight). */
export function moonDirectionAt(hour: number, out: Vec3Like): Vec3Like {
  const angle = ((hour - 6) / 12) * Math.PI
  return normalizeInto(out, -Math.cos(angle), -Math.sin(angle), MOON_TILT_Z)
}

/** Sine of the sun's elevation (its direction's y) at an hour of day. */
export function sunElevationAt(hour: number): number {
  const angle = ((hour - 6) / 12) * Math.PI
  return Math.sin(angle) / Math.hypot(1, SUN_TILT_Z)
}

function normalizeInto(out: Vec3Like, x: number, y: number, z: number): Vec3Like {
  const len = Math.hypot(x, y, z)
  out.x = x / len
  out.y = y / len
  out.z = z / len
  return out
}

export interface ClockChange {
  /** The night began during this advance. */
  readonly nightfall: boolean
  /** The night ended (sunrise) during this advance. */
  readonly daybreak: boolean
}

const NO_CHANGE: ClockChange = { nightfall: false, daybreak: false }

export class WorldClock {
  /** Seconds since 06:00 of the current day (0 ≤ t < CYCLE_SECONDS). */
  private cycleTime = cycleTimeAt(NEW_WORLD_HOUR)
  /** Day number, from 1; ticks over at 06:00. */
  private dayNumber = 1
  private night = false

  constructor() {
    this.night = this.nightAfterJump()
  }

  /** Hour of day, 0-24 (fractional). */
  get hour(): number {
    return hourAt(this.cycleTime)
  }

  /** Day number (1 = the first day); a new day starts at 06:00. */
  get day(): number {
    return this.dayNumber
  }

  /** Seconds since 06:00 (what is saved). */
  get time(): number {
    return this.cycleTime
  }

  /** Sine of the sun's elevation: 1 overhead, 0 on the horizon, < 0 below. */
  get sunElevation(): number {
    return sunElevationAt(this.hour)
  }

  /**
   * How dark the overworld sky is: 0 by day, 1 at night, easing through
   * dusk and dawn (ambience, music).
   */
  get nightAmount(): number {
    const t = Math.min(1, Math.max(0, (0.1 - this.sunElevation) / 0.3))
    return t * t * (3 - 2 * t)
  }

  /**
   * Night: from dusk (the sun ≈ 7° below the horizon) until sunrise - when
   * night creatures roam the surface.
   */
  get isNight(): boolean {
    return this.night
  }

  /** Advance by real seconds; reports whether night fell or day broke. */
  advance(seconds: number): ClockChange {
    if (seconds <= 0) return NO_CHANGE
    this.cycleTime += seconds
    while (this.cycleTime >= CYCLE_SECONDS) {
      this.cycleTime -= CYCLE_SECONDS
      this.dayNumber++
    }
    const wasNight = this.night
    this.night = this.computeNight(wasNight)
    if (wasNight === this.night) return NO_CHANGE
    return { nightfall: this.night, daybreak: !this.night }
  }

  /** Jump to a time (load, debug). Does not report a change. */
  set(time: number, day: number = this.dayNumber): void {
    this.cycleTime = ((time % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS
    this.dayNumber = Math.max(1, Math.floor(day))
    this.night = this.nightAfterJump()
  }

  /** Jump to an hour of day on the current day (debug/tests). */
  setHour(hour: number): void {
    this.set(cycleTimeAt(hour), this.dayNumber)
  }

  /** Night state without history: before noon the morning threshold applies. */
  private nightAfterJump(): boolean {
    return this.computeNight(this.hour < 12)
  }

  private computeNight(wasNight: boolean): boolean {
    const e = this.sunElevation
    // Hysteresis: the evening threshold sits below the morning one
    return wasNight ? e < NIGHT_END_ELEVATION : e < NIGHT_START_ELEVATION
  }
}

/**
 * THE overworld clock (main thread). setupDayNight advances and persists it;
 * the sky, the night spawns and night creatures read it.
 */
export const worldClock = new WorldClock()
