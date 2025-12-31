import type { FpsCounterUI } from './FpsCounter.ts'
import type { ChunkWireframeManager } from '../renderer/ChunkWireframeManager.ts'
import { DebugMode, DEBUG_MODE_STORAGE_KEY, getNextDebugMode } from './DebugMode.ts'

export interface DebugManagerDeps {
  fpsCounter: FpsCounterUI
  wireframeManager: ChunkWireframeManager
}

/**
 * Coordinates debug display state across FPS counter and wireframe visualization.
 * Cycles through: Off -> FPS Only -> FPS + Wireframes -> Off
 */
export class DebugManager {
  private mode: DebugMode = DebugMode.OFF
  private readonly fpsCounter: FpsCounterUI
  private readonly wireframeManager: ChunkWireframeManager

  constructor(deps: DebugManagerDeps) {
    this.fpsCounter = deps.fpsCounter
    this.wireframeManager = deps.wireframeManager
  }

  /**
   * Initialize from stored preference.
   */
  restoreFromStorage(): void {
    const stored = localStorage.getItem(DEBUG_MODE_STORAGE_KEY)
    if (stored !== null) {
      const parsedMode = parseInt(stored, 10)
      if (parsedMode >= 0 && parsedMode <= 2) {
        this.setMode(parsedMode as DebugMode)
        return
      }
    }
    // Default to OFF
    this.setMode(DebugMode.OFF)
  }

  /**
   * Cycle to the next debug mode.
   */
  cycleMode(): void {
    const nextMode = getNextDebugMode(this.mode)
    this.setMode(nextMode)
    localStorage.setItem(DEBUG_MODE_STORAGE_KEY, String(nextMode))
  }

  /**
   * Set the debug mode directly.
   */
  setMode(mode: DebugMode): void {
    this.mode = mode

    // Update FPS counter visibility
    if (mode === DebugMode.OFF) {
      this.fpsCounter.hide()
    } else {
      this.fpsCounter.show()
    }

    // Update wireframe visibility
    this.wireframeManager.setVisible(mode === DebugMode.FPS_AND_WIREFRAMES)
  }

  /**
   * Get the current debug mode.
   */
  getMode(): DebugMode {
    return this.mode
  }
}
