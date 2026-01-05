/**
 * Priority levels for task scheduling.
 * Lower values execute first and are guaranteed to run.
 */
export enum TaskPriority {
  /** Must run every frame (physics, input, controls) */
  CRITICAL = 0,
  /** Important but can be deferred briefly (rendering prep) */
  HIGH = 1,
  /** Normal background work (world generation) */
  NORMAL = 2,
  /** Low priority background work (lighting correction) */
  LOW = 3,
}

/**
 * Result of a task execution.
 */
export interface ITaskResult {
  /** Whether the task completed its work for this frame */
  completed: boolean
  /** Time taken in milliseconds */
  elapsedMs: number
  /** Optional work units processed (for metrics) */
  workUnits?: number
}

/**
 * Interface for a schedulable task.
 */
export interface ITask {
  /** Unique identifier for the task */
  readonly id: string
  /** Task priority level */
  readonly priority: TaskPriority
  /** Whether the task is currently enabled */
  enabled: boolean

  /**
   * Execute the task for this frame.
   * @param deltaTime Time since last frame in seconds
   * @param remainingBudgetMs Remaining frame budget in milliseconds
   * @returns Result of task execution
   */
  execute(deltaTime: number, remainingBudgetMs: number): ITaskResult

  /**
   * Optional: Called when task is skipped due to budget exhaustion.
   * Allows tasks to track skip counts or adjust behavior.
   */
  onSkipped?(): void
}

/**
 * Configuration for creating a task from an update function.
 */
export interface ITaskConfig {
  id: string
  priority: TaskPriority
  /** The update function to call */
  update: (deltaTime: number) => void
}
