import type { IToolbarState } from './PlayerState.ts'
import type { ToolbarUI } from '../ui/Toolbar.ts'

export interface ToolbarInput {
  dispose(): void
}

/**
 * Handles input for the player's toolbar:
 * - Mouse wheel to cycle slots (with wrapping)
 * - Number keys 1-9,0 to select specific slots
 *
 * Input is only processed while pointer lock is active on the given domElement.
 */
export class ToolbarInputHandler implements ToolbarInput {
  private readonly toolbar: IToolbarState
  private readonly ui: ToolbarUI
  private readonly domElement: HTMLElement

  private pointerLocked = false

  constructor(toolbar: IToolbarState, ui: ToolbarUI, domElement: HTMLElement) {
    this.toolbar = toolbar
    this.ui = ui
    this.domElement = domElement

    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    // Use passive: false so we can prevent default scrolling when handling the wheel
    window.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.domElement
  }

  private onWheel = (event: WheelEvent): void => {
    if (!this.pointerLocked) return

    const size = this.toolbar.size
    if (size <= 0) return

    if (event.deltaY === 0) return

    // Prevent page scrolling while controlling the hotbar
    event.preventDefault()

    const direction = event.deltaY > 0 ? 1 : -1
    const current = this.toolbar.selectedIndex
    const next = (current + direction + size) % size

    if (next === current) return

    this.toolbar.selectSlot(next)
    this.ui.updateSelectedSlot(next)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.pointerLocked) return

    // Ignore when any modifier is held to avoid conflicting with browser shortcuts
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

    let index: number | null = null

    switch (event.code) {
      case 'Digit1':
        index = 0
        break
      case 'Digit2':
        index = 1
        break
      case 'Digit3':
        index = 2
        break
      case 'Digit4':
        index = 3
        break
      case 'Digit5':
        index = 4
        break
      case 'Digit6':
        index = 5
        break
      case 'Digit7':
        index = 6
        break
      case 'Digit8':
        index = 7
        break
      case 'Digit9':
        index = 8
        break
      case 'Digit0':
        index = 9
        break
      default:
        break
    }

    if (index == null) return

    const size = this.toolbar.size
    if (index < 0 || index >= size) return

    // Avoid typing numbers into other focused elements while playing
    event.preventDefault()

    if (index === this.toolbar.selectedIndex) return

    this.toolbar.selectSlot(index)
    this.ui.updateSelectedSlot(index)
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    window.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}

