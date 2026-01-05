import { TaskPriority, type ITask, type ITaskResult, type ITaskConfig } from './interfaces/ITask.ts'
import type { ISchedulerMetrics, ITaskMetrics } from './interfaces/ISchedulerMetrics.ts'

/**
 * Configuration for the task scheduler.
 */
export interface TaskSchedulerConfig {
  /** What percentage of frame time to allocate to update budget (default: 0.25 = 25%) */
  budgetRatio?: number
  /** Minimum update budget in milliseconds (default: 1ms) */
  minBudgetMs?: number
  /** Maximum update budget in milliseconds (default: 8ms) */
  maxBudgetMs?: number
  /** How quickly to adapt to frame time changes (0-1, default: 0.1) */
  adaptationRate?: number
  /** Whether to collect detailed metrics (default: false) */
  collectMetrics?: boolean
}

/**
 * Simple task wrapper for functions that don't need fine-grained control.
 */
class SimpleTask implements ITask {
  readonly id: string
  readonly priority: TaskPriority
  enabled = true

  private readonly updateFn: (deltaTime: number) => void

  constructor(config: ITaskConfig) {
    this.id = config.id
    this.priority = config.priority
    this.updateFn = config.update
  }

  execute(deltaTime: number, _remainingBudgetMs: number): ITaskResult {
    const start = performance.now()
    this.updateFn(deltaTime)
    return {
      completed: true,
      elapsedMs: performance.now() - start,
    }
  }
}

/**
 * Central task scheduler with adaptive frame budgeting.
 *
 * The scheduler dynamically adjusts its update budget based on rolling
 * average frame time to maintain smooth, consistent performance.
 *
 * Tasks are organized by priority:
 * - CRITICAL: Always runs (physics, input, controls)
 * - HIGH: Runs if budget allows after critical tasks
 * - NORMAL: Background work, skipped if budget exhausted
 * - LOW: Lowest priority background work
 */
export class TaskScheduler {
  private readonly tasks: Map<string, ITask> = new Map()
  private readonly tasksByPriority: Map<TaskPriority, ITask[]> = new Map()

  // Adaptive budget settings
  private readonly budgetRatio: number
  private readonly minBudgetMs: number
  private readonly maxBudgetMs: number
  private readonly adaptationRate: number
  private readonly collectMetrics: boolean

  // Dynamic state
  private currentBudgetMs: number
  private avgFrameTimeMs: number
  private frameStartTime: number = 0

  // Metrics tracking
  private readonly taskMetrics: Map<string, ITaskMetrics> = new Map()
  private frameMetrics: ISchedulerMetrics | null = null

  constructor(config: TaskSchedulerConfig = {}) {
    this.budgetRatio = config.budgetRatio ?? 0.25 // 25% of frame time
    this.minBudgetMs = config.minBudgetMs ?? 1
    this.maxBudgetMs = config.maxBudgetMs ?? 8
    this.adaptationRate = config.adaptationRate ?? 0.1
    this.collectMetrics = config.collectMetrics ?? false

    // Start with a reasonable default (assumes ~60 FPS)
    this.avgFrameTimeMs = 16.67
    this.currentBudgetMs = this.avgFrameTimeMs * this.budgetRatio

    // Initialize priority buckets
    for (const priority of [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW]) {
      this.tasksByPriority.set(priority, [])
    }
  }

  /**
   * Register a task with the scheduler.
   */
  registerTask(task: ITask): void {
    if (this.tasks.has(task.id)) {
      console.warn(`Task '${task.id}' already registered, replacing`)
      this.unregisterTask(task.id)
    }

    this.tasks.set(task.id, task)
    this.tasksByPriority.get(task.priority)!.push(task)

    if (this.collectMetrics) {
      this.taskMetrics.set(task.id, {
        id: task.id,
        priority: task.priority,
        executionTimeMs: 0,
        executionCount: 0,
        skipCount: 0,
        averageTimeMs: 0,
        workUnitsProcessed: 0,
      })
    }
  }

  /**
   * Create and register a simple task from a config.
   */
  createTask(config: ITaskConfig): ITask {
    const task = new SimpleTask(config)
    this.registerTask(task)
    return task
  }

  /**
   * Unregister a task by ID.
   */
  unregisterTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    this.tasks.delete(id)
    const bucket = this.tasksByPriority.get(task.priority)!
    const index = bucket.indexOf(task)
    if (index !== -1) {
      bucket.splice(index, 1)
    }
    this.taskMetrics.delete(id)
    return true
  }

  /**
   * Get a registered task by ID.
   */
  getTask(id: string): ITask | undefined {
    return this.tasks.get(id)
  }

  /**
   * Enable or disable a task by ID.
   */
  setTaskEnabled(id: string, enabled: boolean): void {
    const task = this.tasks.get(id)
    if (task) {
      task.enabled = enabled
    }
  }

  /**
   * Report the previous frame's total time for adaptive budgeting.
   * Call this at the start of each frame with the previous frame's duration.
   */
  reportFrameTime(frameTimeMs: number): void {
    // Update rolling average frame time
    this.avgFrameTimeMs = this.avgFrameTimeMs * (1 - this.adaptationRate) + frameTimeMs * this.adaptationRate

    // Budget is a percentage of the average frame time
    // Higher FPS = shorter frames = smaller budget (proportionally)
    const targetBudget = this.avgFrameTimeMs * this.budgetRatio

    // Clamp to min/max bounds
    this.currentBudgetMs = Math.max(this.minBudgetMs, Math.min(this.maxBudgetMs, targetBudget))
  }

  /**
   * Check if there's time remaining in the current frame budget.
   */
  private hasTimeRemaining(): boolean {
    return performance.now() - this.frameStartTime < this.currentBudgetMs
  }

  /**
   * Get elapsed time since frame start.
   */
  private getElapsedMs(): number {
    return performance.now() - this.frameStartTime
  }

  /**
   * Execute all scheduled tasks for this frame.
   * Call this from the game loop's update function.
   *
   * @param deltaTime Time since last frame in seconds
   */
  update(deltaTime: number): void {
    this.frameStartTime = performance.now()

    let criticalTime = 0
    let backgroundTime = 0
    let tasksExecuted = 0
    let tasksSkipped = 0

    // Process tasks by priority
    for (const priority of [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW]) {
      const isCritical = priority === TaskPriority.CRITICAL
      const tasks = this.tasksByPriority.get(priority)!

      for (const task of tasks) {
        if (!task.enabled) continue

        // Check budget for non-critical tasks
        if (!isCritical && !this.hasTimeRemaining()) {
          task.onSkipped?.()
          tasksSkipped++

          if (this.collectMetrics) {
            const metrics = this.taskMetrics.get(task.id)!
            metrics.skipCount++
          }
          continue
        }

        // Execute task
        const remainingMs = Math.max(0, this.currentBudgetMs - this.getElapsedMs())
        const result = task.execute(deltaTime, remainingMs)
        tasksExecuted++

        // Track time
        if (isCritical) {
          criticalTime += result.elapsedMs
        } else {
          backgroundTime += result.elapsedMs
        }

        // Update metrics
        if (this.collectMetrics) {
          const metrics = this.taskMetrics.get(task.id)!
          metrics.executionTimeMs = result.elapsedMs
          metrics.executionCount++
          metrics.workUnitsProcessed += result.workUnits ?? 0
          // Rolling average (exponential moving average)
          const alpha = 0.1
          metrics.averageTimeMs = metrics.averageTimeMs * (1 - alpha) + result.elapsedMs * alpha
        }
      }
    }

    // Store frame metrics
    if (this.collectMetrics) {
      this.frameMetrics = {
        frameTimeMs: performance.now() - this.frameStartTime,
        criticalTimeMs: criticalTime,
        backgroundTimeMs: backgroundTime,
        tasksSkipped,
        tasksExecuted,
        remainingBudgetMs: Math.max(0, this.currentBudgetMs - this.getElapsedMs()),
        tasks: new Map(this.taskMetrics),
      }
    }
  }

  /**
   * Get the current dynamic budget (in ms).
   */
  getCurrentBudget(): number {
    return this.currentBudgetMs
  }

  /**
   * Get the rolling average frame time (in ms).
   */
  getAverageFrameTime(): number {
    return this.avgFrameTimeMs
  }

  /**
   * Get the remaining budget for this frame (in ms).
   * Useful for tasks that want to self-limit their work.
   */
  getRemainingBudget(): number {
    return Math.max(0, this.currentBudgetMs - this.getElapsedMs())
  }

  /**
   * Get metrics for the last frame.
   */
  getMetrics(): ISchedulerMetrics | null {
    return this.frameMetrics
  }

  /**
   * Get metrics for a specific task.
   */
  getTaskMetrics(id: string): ITaskMetrics | undefined {
    return this.taskMetrics.get(id)
  }

  /**
   * Get a summary of scheduler state for debugging.
   */
  getDebugSummary(): {
    totalTasks: number
    enabledTasks: number
    tasksByPriority: Record<string, number>
    currentBudgetMs: number
    avgFrameTimeMs: number
  } {
    const tasksByPriority: Record<string, number> = {}
    for (const [priority, tasks] of this.tasksByPriority) {
      const name = TaskPriority[priority]
      tasksByPriority[name] = tasks.filter((t) => t.enabled).length
    }

    return {
      totalTasks: this.tasks.size,
      enabledTasks: Array.from(this.tasks.values()).filter((t) => t.enabled).length,
      tasksByPriority,
      currentBudgetMs: this.currentBudgetMs,
      avgFrameTimeMs: this.avgFrameTimeMs,
    }
  }
}
