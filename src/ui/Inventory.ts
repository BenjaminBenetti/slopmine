import type { IItemStack } from '../player/PlayerState.ts'
import { syncSlotsFromState } from './SlotRenderer.ts'

export interface InventoryUIOptions {
  columns?: number
  rows?: number
  slotSizePx?: number
}

export interface InventoryUI {
  readonly root: HTMLDivElement
  readonly panel: HTMLDivElement
  readonly contentWrapper: HTMLDivElement
  readonly slots: HTMLDivElement[]
  readonly isOpen: boolean
  open(): void
  close(): void
  toggle(): void
  destroy(): void
  syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void
}

/**
 * Grid-based inventory overlay.
 * Centered on screen with a semi-transparent backdrop, styled
 * similarly to the toolbar slots.
 */
export function createInventoryUI(
  parent: HTMLElement = document.body,
  options: InventoryUIOptions = {},
): InventoryUI {
  const columns = options.columns ?? 10
  const rows = options.rows ?? 8
  const slotSize = options.slotSizePx ?? 44

  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'
  overlay.style.background = 'rgba(0, 0, 0, 0.45)'
  overlay.style.zIndex = '35'

  const panel = document.createElement('div')

  // Content wrapper for horizontal layout (crafting panel + inventory grid)
  const contentWrapper = document.createElement('div')
  contentWrapper.style.display = 'flex'
  contentWrapper.style.gap = '1rem'
  contentWrapper.style.alignItems = 'flex-start'

  // Grid container with its own styling
  const gridContainer = document.createElement('div')
  gridContainer.style.background = 'rgba(12, 12, 12, 0.96)'
  gridContainer.style.borderRadius = '8px'
  gridContainer.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  gridContainer.style.padding = '1rem 1.25rem'

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = `repeat(${columns}, min(${slotSize}px, 5vw))`
  grid.style.gap = '0.4rem'

  const slots: HTMLDivElement[] = []

  for (let i = 0; i < columns * rows; i += 1) {
    const slot = document.createElement('div')
    slot.style.width = `min(${slotSize}px, 5vw)`
    slot.style.height = `min(${slotSize}px, 5vw)`
    slot.style.background = 'rgba(8, 8, 8, 0.98)'
    slot.style.border = '2px solid rgba(255, 255, 255, 0.35)'
    slot.style.borderRadius = '4px'
    slot.style.boxShadow = 'inset 0 0 0 1px rgba(0, 0, 0, 0.7)'
    slot.style.display = 'flex'
    slot.style.alignItems = 'center'
    slot.style.justifyContent = 'center'
    slot.style.position = 'relative'

    slots.push(slot)
    grid.appendChild(slot)
  }

  gridContainer.appendChild(grid)
  contentWrapper.appendChild(gridContainer)
  panel.appendChild(contentWrapper)
  overlay.appendChild(panel)
  parent.appendChild(overlay)

  let open = false

  const applyVisibility = (): void => {
    overlay.style.display = open ? 'flex' : 'none'
  }

  const api: InventoryUI = {
    root: overlay,
    panel,
    contentWrapper,
    slots,
    get isOpen() {
      return open
    },
    open(): void {
      open = true
      applyVisibility()
    },
    close(): void {
      open = false
      applyVisibility()
    },
    toggle(): void {
      open = !open
      applyVisibility()
    },
    destroy(): void {
      if (overlay.parentElement === parent) {
        parent.removeChild(overlay)
      }
    },
    syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void {
      syncSlotsFromState(slots, stateSlots)
    },
  }

  applyVisibility()
  return api
}

