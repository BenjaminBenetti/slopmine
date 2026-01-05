import { TaskPriority, type ITask, type ITaskResult } from './interfaces/ITask.ts'

/**
 * Configuration for a budget-aware task.
 */
export interface BudgetAwareTaskConfig {
  id: string
  priority: TaskPriority
  /** Function that performs a single unit of work, returns true if more work remains */
  doWork: () => boolean
  /** Optional: Maximum work units per frame (default: unlimited, controlled by budget) */
  maxUnitsPerFrame?: number
}

/**
 * A task that processes work units until the budget is exhausted.
 * Dynamically measures the cost of each work unit and adapts.
 */
export class BudgetAwareTask implements ITask {
  readonly id: string
  readonly priority: TaskPriority
  enabled = true

  private readonly doWork: () => boolean
  private readonly maxUnitsPerFrame: number

  // Adaptive timing - no initial guess needed
  private measuredUnitTimeMs = 0
  private sampleCount = 0

  private skipCount = 0

  constructor(config: BudgetAwareTaskConfig) {
    this.id = config.id
    this.priority = config.priority
    this.doWork = config.doWork
    this.maxUnitsPerFrame = config.maxUnitsPerFrame ?? Infinity
  }

  execute(_deltaTime: number, remainingBudgetMs: number): ITaskResult {
    const start = performance.now()
    let workUnits = 0
    let hasMoreWork = true

    while (hasMoreWork && workUnits < this.maxUnitsPerFrame) {
      const elapsed = performance.now() - start

      // Always do at least one unit to get a measurement
      // After that, check if we have budget for another unit
      if (workUnits > 0 && this.measuredUnitTimeMs > 0) {
        if (elapsed + this.measuredUnitTimeMs > remainingBudgetMs) {
          break
        }
      }

      // Do one unit of work and measure it
      const unitStart = performance.now()
      hasMoreWork = this.doWork()
      const unitTime = performance.now() - unitStart
      workUnits++

      // Update measured time with exponential moving average
      // Use faster adaptation when we have few samples
      this.sampleCount++
      const alpha = Math.min(0.5, 2 / (this.sampleCount + 1)) // Starts at 0.5, converges to ~0.1
      this.measuredUnitTimeMs = this.measuredUnitTimeMs * (1 - alpha) + unitTime * alpha
    }

    return {
      completed: !hasMoreWork,
      elapsedMs: performance.now() - start,
      workUnits,
    }
  }

  onSkipped(): void {
    this.skipCount++
  }

  getSkipCount(): number {
    return this.skipCount
  }

  resetSkipCount(): void {
    this.skipCount = 0
  }

  /**
   * Get the current measured unit time (for debugging).
   */
  getMeasuredUnitTimeMs(): number {
    return this.measuredUnitTimeMs
  }
}
