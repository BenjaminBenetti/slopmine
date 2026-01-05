import type { TaskPriority } from './ITask.ts'

/**
 * Per-task metrics for debugging.
 */
export interface ITaskMetrics {
  id: string
  priority: TaskPriority
  /** Total execution time this frame (ms) */
  executionTimeMs: number
  /** Number of times executed this session */
  executionCount: number
  /** Number of times skipped due to budget */
  skipCount: number
  /** Average execution time (ms) */
  averageTimeMs: number
  /** Work units processed (if reported) */
  workUnitsProcessed: number
}

/**
 * Overall scheduler metrics.
 */
export interface ISchedulerMetrics {
  /** Total time spent in scheduler this frame (ms) */
  frameTimeMs: number
  /** Time spent on critical tasks (ms) */
  criticalTimeMs: number
  /** Time spent on background tasks (ms) */
  backgroundTimeMs: number
  /** Number of tasks skipped due to budget */
  tasksSkipped: number
  /** Number of tasks executed */
  tasksExecuted: number
  /** Remaining budget after all tasks (ms) */
  remainingBudgetMs: number
  /** Per-task metrics */
  tasks: Map<string, ITaskMetrics>
}
