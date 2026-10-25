import type { IToolbarState } from './PlayerState.ts'
import type { ToolbarUI } from '../ui/Toolbar.ts'
import { hasGameplayPointer } from './PointerMode.ts'

export interface ToolbarInput {
  dispose(): void
}

/**
 * Handles input for the player's toolbar:
 * - Mouse wheel to cycle slots (with wrapping)
 * - Number keys 1-9,0 to select specific slots
 *
 * Input is only processed in gameplay (PointerMode: locked, no menu open).
 */
export class ToolbarInputHandler implements ToolbarInput {
  private readonly toolbar: IToolbarState
  private readonly ui: ToolbarUI
  private lastWheelTime = 0

  constructor(toolbar: IToolbarState, ui: ToolbarUI) {
    this.toolbar = toolbar
    this.ui = ui

    // Listen on both window and document for maximum compatibility
    window.addEventListener('wheel', this.onWheel)
    document.addEventListener('wheel', this.onWheel)
    window.addEventListener('keydown', this.onKeyDown)
  }

  private onWheel = (event: WheelEvent): void => {
    // Debounce to prevent double-firing from window+document listeners
    const now = performance.now()
    if (now - this.lastWheelTime < 5) return
    this.lastWheelTime = now

    // In gameplay only (not while a menu has the cursor)
    if (!hasGameplayPointer()) return

    // Ignore if no meaningful vertical scroll (use threshold for floating-point safety)
    if (Math.abs(event.deltaY) < 0.01) return

    const size = this.toolbar.size
    if (size <= 0) return

    // Use Math.sign for cleaner direction handling (returns -1, 0, or 1)
    const direction = Math.sign(event.deltaY)
    if (direction === 0) return

    const current = this.toolbar.selectedIndex
    const next = ((current + direction) % size + size) % size

    this.toolbar.selectSlot(next)
    this.ui.updateSelectedSlot(next)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // In gameplay only (not while a menu has the cursor)
    if (!hasGameplayPointer()) return

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
    window.removeEventListener('wheel', this.onWheel)
    document.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}
