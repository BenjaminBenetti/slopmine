export interface GameLoopCallback {
  update(deltaTime: number): void
  render(): void
}

export interface GameLoopMetrics {
  tickCount: number
  frameTime: number
}

export class GameLoop {
  private static readonly TICK_RATE = 60
  private static readonly TICK_DURATION_MS = 1000 / GameLoop.TICK_RATE
  private static readonly TICK_DURATION_S = 1 / GameLoop.TICK_RATE
  private static readonly MAX_UPDATES_PER_FRAME = 1

  private lastTime = 0
  private accumulator = 0
  private running = false
  private _paused = false
  private callback: GameLoopCallback
  private onMetrics?: (metrics: GameLoopMetrics) => void
  private targetFps: number
  private targetFrameMs: number
  // Pre-allocated metrics object to avoid per-frame GC pressure
  private readonly metricsResult: GameLoopMetrics = { tickCount: 0, frameTime: 0 }

  constructor(callback: GameLoopCallback, onMetrics?: (metrics: GameLoopMetrics) => void, targetFps = 60) {
    this.callback = callback
    this.onMetrics = onMetrics
    this.targetFps = targetFps
    this.targetFrameMs = 1000 / targetFps
  }

  setTargetFps(fps: number): void {
    this.targetFps = fps
    this.targetFrameMs = 1000 / fps
  }

  /** When paused, updates are skipped but rendering continues */
  get paused(): boolean {
    return this._paused
  }

  set paused(value: boolean) {
    this._paused = value
    // Reset accumulator when unpausing to avoid catch-up updates
    if (!value) {
      this.accumulator = 0
      this.lastTime = performance.now()
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.accumulator = 0
    this.loop()
  }

  stop(): void {
    this.running = false
  }

  private loop = (): void => {
    if (!this.running) return

    const frameStartTime = performance.now()
    const frameTime = frameStartTime - this.lastTime
    this.lastTime = frameStartTime

    let tickCount = 0

    // Skip updates when paused
    if (!this._paused) {
      this.accumulator += frameTime

      // Run fixed timestep updates at 60 UPS
      while (this.accumulator >= GameLoop.TICK_DURATION_MS &&
             tickCount < GameLoop.MAX_UPDATES_PER_FRAME) {
        this.callback.update(GameLoop.TICK_DURATION_S)
        this.accumulator -= GameLoop.TICK_DURATION_MS
        tickCount++
      }

      // Discard excess time to prevent accumulator buildup on severe lag
      if (this.accumulator > GameLoop.TICK_DURATION_MS * GameLoop.MAX_UPDATES_PER_FRAME) {
        this.accumulator = 0
      }
    }

    this.callback.render()

    // Update pre-allocated metrics object to avoid allocation
    this.metricsResult.tickCount = tickCount
    this.metricsResult.frameTime = frameTime
    this.onMetrics?.(this.metricsResult)

    // Busy-wait for smooth frame pacing when FPS limit is set
    const targetEndTime = frameStartTime + this.targetFrameMs
    while (performance.now() < targetEndTime) {
      // Spin
    }

    requestAnimationFrame(this.loop)
  }
}
