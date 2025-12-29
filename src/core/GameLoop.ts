export interface GameLoopCallback {
  update(deltaTime: number): void
  render(): void
}

export class GameLoop {
  private lastTime = 0
  private running = false
  private callback: GameLoopCallback

  constructor(callback: GameLoopCallback) {
    this.callback = callback
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.loop()
  }

  stop(): void {
    this.running = false
  }

  private loop = (): void => {
    if (!this.running) return

    const currentTime = performance.now()
    const deltaTime = (currentTime - this.lastTime) / 1000
    this.lastTime = currentTime

    this.callback.update(deltaTime)
    this.callback.render()

    requestAnimationFrame(this.loop)
  }
}
