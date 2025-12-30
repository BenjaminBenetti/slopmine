import type { CameraControls } from './FirstPersonCameraControls.ts'

export interface SettingsInputOptions {
  domElement: HTMLElement
  cameraControls: CameraControls
  isInventoryOpen: () => boolean
  openSettingsUI: () => void
  closeSettingsUI: () => void
  setGamePaused: (paused: boolean) => void
}

export interface SettingsInput {
  dispose(): void
}

/**
 * Handles the settings menu visibility:
 * - Show settings when pointer lock is lost (and inventory is not open)
 * - Hide settings when pointer lock is acquired
 *
 * Simple rule: no pointer lock + no inventory = show settings menu
 * Also pauses/unpauses the game loop accordingly.
 */
export class SettingsInputHandler implements SettingsInput {
  private readonly domElement: HTMLElement
  private readonly cameraControls: CameraControls
  private readonly isInventoryOpen: () => boolean
  private readonly openSettingsUI: () => void
  private readonly closeSettingsUI: () => void
  private readonly setGamePaused: (paused: boolean) => void

  constructor(options: SettingsInputOptions) {
    this.domElement = options.domElement
    this.cameraControls = options.cameraControls
    this.isInventoryOpen = options.isInventoryOpen
    this.openSettingsUI = options.openSettingsUI
    this.closeSettingsUI = options.closeSettingsUI
    this.setGamePaused = options.setGamePaused

    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
  }

  private onPointerLockChange = (): void => {
    const isLocked = document.pointerLockElement === this.domElement

    if (isLocked) {
      // Pointer lock acquired - close settings, enable controls, unpause
      this.closeSettingsUI()
      this.cameraControls.setInputEnabled(true)
      this.setGamePaused(false)
    } else {
      // Pointer lock lost - show settings if inventory is not open
      if (!this.isInventoryOpen()) {
        this.openSettingsUI()
        this.cameraControls.setInputEnabled(false)
        this.setGamePaused(true)
      }
    }
  }
}

