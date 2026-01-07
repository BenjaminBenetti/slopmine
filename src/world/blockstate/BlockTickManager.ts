import type { ITask, ITaskResult } from '../../core/interfaces/ITask.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { ITickableBlockState } from './interfaces/ITickableBlockState.ts'

/**
 * Scheduler task that ticks all active block states each frame.
 *
 * Registered with TaskScheduler at NORMAL priority.
 * Manages a set of tickable states and updates them each frame.
 */
export class BlockTickManager implements ITask {
  readonly id = 'block-tick'
  readonly priority = TaskPriority.NORMAL
  enabled = true

  private readonly activeStates: Set<ITickableBlockState> = new Set()

  /**
   * Register a tickable block state for updates.
   */
  register(state: ITickableBlockState): void {
    this.activeStates.add(state)
  }

  /**
   * Unregister a tickable block state.
   */
  unregister(state: ITickableBlockState): void {
    this.activeStates.delete(state)
  }

  /**
   * Check if a state is registered.
   */
  has(state: ITickableBlockState): boolean {
    return this.activeStates.has(state)
  }

  /**
   * Get the number of active states.
   */
  get activeCount(): number {
    return this.activeStates.size
  }

  /**
   * Execute the task - tick all active states.
   */
  execute(deltaTime: number, _remainingBudgetMs: number): ITaskResult {
    const startTime = performance.now()
    const toRemove: ITickableBlockState[] = []

    for (const state of this.activeStates) {
      // Tick the state and check if it should remain active
      const stillActive = state.tick(deltaTime)
      if (!stillActive) {
        toRemove.push(state)
      }
    }

    // Remove inactive states
    for (const state of toRemove) {
      this.activeStates.delete(state)
    }

    const elapsedMs = performance.now() - startTime

    return {
      completed: true,
      elapsedMs,
      workUnits: this.activeStates.size,
    }
  }

  /**
   * Clear all registered states.
   */
  dispose(): void {
    this.activeStates.clear()
  }
}
