/**
 * Frame budget utility for time-slicing expensive operations.
 * Helps maintain smooth framerate by yielding when the budget is exhausted.
 */
export class FrameBudget {
  private frameStartTime: number = 0
  private readonly budgetMs: number

  /**
   * @param budgetMs Time budget per frame in milliseconds (default 2ms works for 240Hz+)
   */
  constructor(budgetMs: number = 2) {
    this.budgetMs = budgetMs
  }

  /**
   * Mark the start of a new frame. Call this at the beginning of work.
   */
  startFrame(): void {
    this.frameStartTime = performance.now()
  }

  /**
   * Check if there's time remaining in the current frame budget.
   */
  hasTimeRemaining(): boolean {
    return performance.now() - this.frameStartTime < this.budgetMs
  }

  /**
   * Get elapsed time since frame start in milliseconds.
   */
  getElapsedMs(): number {
    return performance.now() - this.frameStartTime
  }

  /**
   * Yield to the event loop if the frame budget is exhausted.
   * Uses requestAnimationFrame for smooth frame alignment.
   */
  async yieldIfNeeded(): Promise<void> {
    if (!this.hasTimeRemaining()) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      this.startFrame()
    }
  }

  /**
   * Force yield to the next frame regardless of remaining budget.
   */
  async yield(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    this.startFrame()
  }
}

// Shared instance for global use
export const frameBudget = new FrameBudget()
