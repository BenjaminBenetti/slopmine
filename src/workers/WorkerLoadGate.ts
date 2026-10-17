/**
 * Throttle for the first script load of the heavy module workers (generation,
 * LOD and liquid physics workers each import the block registry and every
 * biome: ~800-950 modules).
 *
 * Under `vite dev` a module worker fetches its whole import graph as separate
 * requests. A dozen such workers starting together exceeded Chromium's limit
 * on outstanding requests per renderer: a module fetch failed with
 * net::ERR_INSUFFICIENT_RESOURCES and the worker died before running (an
 * `error` event without a message), recovered only by the pools' retries. In
 * dev at most DEV_CONCURRENT_LOADS such workers load at once; production
 * bundles each worker into one file and is not throttled (the callback runs
 * synchronously, as before).
 */

const DEV_CONCURRENT_LOADS = 2

/** A load slot is freed after this long even if the worker never reported (no deadlock). */
const SLOT_TIMEOUT_MS = 20000

const maxConcurrent = import.meta.env?.DEV ? DEV_CONCURRENT_LOADS : Infinity
let activeLoads = 0
const waiting: Array<() => void> = []

/**
 * Run `start` once a load slot is free. `start` creates the worker and must
 * call `loaded` when the worker reported ready or failed (extra calls are
 * ignored).
 */
export function whenWorkerLoadSlotFree(start: (loaded: () => void) => void): void {
  if (activeLoads < maxConcurrent) {
    run(start)
  } else {
    waiting.push(() => run(start))
  }
}

function run(start: (loaded: () => void) => void): void {
  activeLoads++
  let done = false
  const loaded = (): void => {
    if (done) return
    done = true
    clearTimeout(timer)
    activeLoads--
    waiting.shift()?.()
  }
  const timer = setTimeout(loaded, SLOT_TIMEOUT_MS)
  start(loaded)
}

/**
 * A worker `error` event that is not an ErrorEvent with a message: the
 * worker's script (or one of its imports) failed to load - in dev typically a
 * request refused under load - rather than an exception thrown while running.
 */
export function isWorkerLoadFailure(event: Event): boolean {
  return !(event as ErrorEvent).message
}
