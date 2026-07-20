import type { ITask, ITaskResult } from '../../core/interfaces/ITask.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { IWorld } from '../interfaces/IBlock.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

/**
 * A single pending tick for a block position.
 */
interface PendingTick {
  x: bigint
  y: bigint
  z: bigint
  /** Block ID captured at schedule time; the tick is dropped if it changed. */
  blockId: number
  /** Game-time (seconds) at which the tick fires. */
  dueTime: number
}

/** The 6 face-adjacent neighbor offsets. */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [bigint, bigint, bigint]> = [
  [1n, 0n, 0n], [-1n, 0n, 0n],
  [0n, 1n, 0n], [0n, -1n, 0n],
  [0n, 0n, 1n], [0n, 0n, -1n],
]

/** Max scheduled ticks processed per frame even with budget to spare. */
const MAX_TICKS_PER_FRAME = 64

/**
 * Slow, interval-based block ticking (leaf decay, future crops, etc.).
 *
 * Unlike BlockTickManager (per-frame updates for active stateful blocks like
 * a smelting forge), this system is fully reactive and coarse-grained: block
 * TYPES declare a tickInterval + onScheduledTick hook, and positions are only
 * queued when the block or a direct neighbor changes at runtime. A dormant
 * world schedules nothing - worldgen writes bypass setBlock side effects, so
 * freshly generated chunks cost zero until the player disturbs them.
 *
 * Delays are jittered (0.75x-1.5x the declared interval) so a bulk change
 * (felling a tree) cascades organically instead of firing in lockstep.
 */
export class ScheduledBlockTicks implements ITask {
  readonly id = 'scheduled-block-ticks'
  readonly priority = TaskPriority.NORMAL
  enabled = true

  private readonly world: IWorld
  private readonly pending: Map<string, PendingTick> = new Map()
  /** Accumulated game time in seconds. */
  private time = 0
  /** Scratch list of due ticks, reused across frames to avoid GC pressure. */
  private readonly dueScratch: PendingTick[] = []

  constructor(world: IWorld) {
    this.world = world
  }

  /**
   * Notify the system that the block at (x, y, z) changed. Schedules a tick
   * for the position itself and each face-adjacent neighbor whose block type
   * declares a tickInterval.
   */
  onBlockChanged(x: bigint, y: bigint, z: bigint): void {
    this.scheduleIfTickable(x, y, z)
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      this.scheduleIfTickable(x + dx, y + dy, z + dz)
    }
  }

  /**
   * Schedule a tick for the block at (x, y, z) if its type declares one.
   * Deduplicates by position, keeping the earlier due time.
   */
  scheduleIfTickable(x: bigint, y: bigint, z: bigint): void {
    const block = this.world.getBlock(x, y, z)
    const interval = block.properties.tickInterval
    if (interval === undefined || !block.onScheduledTick) return

    const jitteredDelay = interval * (0.75 + Math.random() * 0.75)
    const dueTime = this.time + jitteredDelay

    const key = `${x},${y},${z}`
    const existing = this.pending.get(key)
    if (existing && existing.dueTime <= dueTime) return

    this.pending.set(key, { x, y, z, blockId: block.properties.id, dueTime })
  }

  /** Number of ticks currently queued (for debugging/stats). */
  get pendingCount(): number {
    return this.pending.size
  }

  execute(deltaTime: number, remainingBudgetMs: number): ITaskResult {
    const startTime = performance.now()
    this.time += deltaTime

    if (this.pending.size === 0) {
      return { completed: true, elapsedMs: performance.now() - startTime, workUnits: 0 }
    }

    // Snapshot due ticks first: processing a tick can schedule new ones
    // (decay cascades), and those must not fire in the same frame.
    const due = this.dueScratch
    due.length = 0
    for (const [key, tick] of this.pending) {
      if (tick.dueTime <= this.time) {
        due.push(tick)
        this.pending.delete(key)
      }
    }

    let processed = 0
    for (const tick of due) {
      // Stop when the frame budget runs out; unprocessed ticks are re-queued.
      if (processed >= MAX_TICKS_PER_FRAME || performance.now() - startTime > remainingBudgetMs) {
        this.pending.set(`${tick.x},${tick.y},${tick.z}`, tick)
        continue
      }

      const block = this.world.getBlock(tick.x, tick.y, tick.z)
      // The block changed (or was removed) since scheduling - drop the tick.
      if (block.properties.id !== tick.blockId || block.properties.id === BlockIds.AIR) continue
      if (!block.onScheduledTick) continue

      processed++
      const reschedule = block.onScheduledTick(this.world, tick.x, tick.y, tick.z)
      if (reschedule) {
        this.scheduleIfTickable(tick.x, tick.y, tick.z)
      }
    }
    due.length = 0

    return {
      completed: true,
      elapsedMs: performance.now() - startTime,
      workUnits: processed,
    }
  }

  dispose(): void {
    this.pending.clear()
    this.dueScratch.length = 0
  }
}
