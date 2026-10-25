import type { CameraControls } from './FirstPersonCameraControls.ts'
import { hasGameplayPointer } from './PointerMode.ts'

export interface SettingsInputOptions {
  domElement: HTMLElement
  cameraControls: CameraControls
  openSettingsUI: () => void
  closeSettingsUI: () => void
  setGamePaused: (paused: boolean) => void
}

export interface SettingsInput {
  dispose(): void
}

/**
 * Handles the settings (pause) menu visibility:
 * - Show it whenever pointer lock is lost (Esc, leaving the window)
 * - Hide it when pointer lock is acquired
 *
 * The other menus (inventory, block UIs, journal) keep the lock and use the
 * virtual cursor (PointerMode); they close themselves when the lock goes, so
 * the pause menu is the only screen with the real mouse.
 * Also pauses/unpauses the game loop accordingly.
 */
export class SettingsInputHandler implements SettingsInput {
  private readonly domElement: HTMLElement
  private readonly cameraControls: CameraControls
  private readonly openSettingsUI: () => void
  private readonly closeSettingsUI: () => void
  private readonly setGamePaused: (paused: boolean) => void

  constructor(options: SettingsInputOptions) {
    this.domElement = options.domElement
    this.cameraControls = options.cameraControls
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
      // Pointer lock acquired - close settings, enable controls (unless a menu has the cursor), unpause
      this.closeSettingsUI()
      this.cameraControls.setInputEnabled(hasGameplayPointer())
      this.setGamePaused(false)
    } else {
      // Pointer lock lost - the pause menu (any open menu closes itself)
      this.openSettingsUI()
      this.cameraControls.setInputEnabled(false)
      this.setGamePaused(true)
    }
  }
}
