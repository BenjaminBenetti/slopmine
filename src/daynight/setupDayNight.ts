import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { worldClock, CYCLE_SECONDS, cycleTimeAt } from './WorldClock.ts'

/** Where a night's sleep ends (just after sunrise). */
const WAKE_HOUR = 6.25
/** Where the debug night toggle lands: early night, the moon well up. */
const DEBUG_NIGHT_HOUR = 21

/** Keyed player data: the time of day survives a reload. */
const PLAYER_DATA_KEY = 'daynight'

interface DayNightPlayerData {
  version: 1
  /** Seconds since 06:00. */
  time: number
  day: number
}

export interface DayNightSystem {
  /** Jump to the next morning (sleeping in a bed), announcing daybreak. */
  skipToMorning(): void
  /**
   * Debug (the performance overlay's button): by day jump to 21:00, at night
   * to the next morning. A night skipped this way never counts as survived.
   */
  toggleNight(): void
}

export interface DayNightSetupDeps {
  readonly scheduler: TaskScheduler
  readonly persistence: {
    initialize(): Promise<unknown>
    registerPlayerDataContributor(key: string, collect: () => unknown): void
    loadPlayerData<T>(key: string): Promise<T | null>
  }
}

/**
 * Run the overworld clock: restore the saved time of day, advance it every
 * frame of gameplay (the pause menu stops it with the game loop) and
 * announce `nightfall` / `daybreak` on gameEvents. The sky and light read
 * `worldClock` in the 'skybox' task; night creatures read it themselves.
 */
export function setupDayNight(deps: DayNightSetupDeps): DayNightSystem {
  // Hold the clock until the saved time is in, so it never jumps after play starts
  let loaded = false
  deps.persistence
    .initialize()
    .then(() => deps.persistence.loadPlayerData<Partial<DayNightPlayerData>>(PLAYER_DATA_KEY))
    .then((data) => {
      if (data && typeof data.time === 'number' && Number.isFinite(data.time)) {
        worldClock.set(Math.min(Math.max(data.time, 0), CYCLE_SECONDS), typeof data.day === 'number' ? data.day : 1)
      }
      // Load first, then contribute (a contributor registered earlier would save the default over it)
      deps.persistence.registerPlayerDataContributor(PLAYER_DATA_KEY, (): DayNightPlayerData => ({
        version: 1,
        time: worldClock.time,
        day: worldClock.day,
      }))
    })
    .catch((error) => console.warn('[daynight] could not load the time of day (not saving it this session)', error))
    .finally(() => {
      loaded = true
    })

  // Whether the player has died since nightfall (daybreak reports a survived night)
  let diedTonight = false
  gameEvents.on('player-died', () => {
    diedTonight = true
  })

  const advance = (seconds: number): void => {
    const change = worldClock.advance(seconds)
    if (change.nightfall) {
      diedTonight = false
      gameEvents.emit({ type: 'nightfall', day: worldClock.day })
    } else if (change.daybreak) {
      gameEvents.emit({ type: 'daybreak', day: worldClock.day, survived: !diedTonight })
    }
  }

  deps.scheduler.createTask({
    id: 'world-clock',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      if (loaded) advance(dt)
    },
  })

  // Forward to the next time the clock reads `hour`, so nightfall/daybreak fire on the way
  const skipTo = (hour: number): void => {
    const target = cycleTimeAt(hour)
    const now = worldClock.time
    advance(now < target ? target - now : CYCLE_SECONDS - now + target)
  }

  return {
    skipToMorning: () => skipTo(WAKE_HOUR),
    toggleNight: () => {
      if (worldClock.isNight) {
        diedTonight = true
        skipTo(WAKE_HOUR)
      } else {
        skipTo(DEBUG_NIGHT_HOUR)
      }
    },
  }
}
