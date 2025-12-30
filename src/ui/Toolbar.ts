import type { IItem } from '../items/Item.ts'
import { syncSlotsFromState } from './SlotRenderer.ts'

export interface ToolbarUIOptions {
  slotCount?: number
  slotSizePx?: number
}

export interface ToolbarUI {
  readonly root: HTMLDivElement
  readonly slots: HTMLDivElement[]
  updateSelectedSlot(index: number): void
  destroy(): void
  syncFromState(stateSlots: ReadonlyArray<IItem | null>): void
}

/**
 * Creates a bottom-center toolbar with a row of square slots.
 * Slots are empty containers styled for a Minecraft-like hotbar.
 */
export function createToolbarUI(
  parent: HTMLElement = document.body,
  options: ToolbarUIOptions = {}
): ToolbarUI {
  const slotCount = options.slotCount ?? 10
  const slotSize = options.slotSizePx ?? 44

  const root = document.createElement('div')
  root.style.position = 'fixed'
  root.style.left = '50%'
  root.style.bottom = '2.5%'
  root.style.transform = 'translateX(-50%)'
  root.style.display = 'flex'
  root.style.gap = '0.5rem'
  root.style.padding = '0.5rem 0.75rem'
  root.style.background = 'rgba(0, 0, 0, 0.45)'
  root.style.borderRadius = '6px'
  root.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  root.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.9)'
  root.style.pointerEvents = 'none'
  root.style.zIndex = '25'
  root.style.justifyContent = 'center'

  const slots: HTMLDivElement[] = []

  const selectedBorder = '2px solid rgba(255, 255, 255, 0.95)'
  const normalBorder = '2px solid rgba(255, 255, 255, 0.3)'

  for (let i = 0; i < slotCount; i += 1) {
    const slot = document.createElement('div')
    slot.style.width = `min(${slotSize}px, 7vw)`
    slot.style.height = `min(${slotSize}px, 7vw)`
    slot.style.flex = '0 0 auto'
    slot.style.background = 'rgba(12, 12, 12, 0.95)'
    slot.style.border = normalBorder
    slot.style.borderRadius = '4px'
    slot.style.boxShadow = 'inset 0 0 0 1px rgba(0, 0, 0, 0.6)'
    slot.style.display = 'flex'
    slot.style.alignItems = 'center'
    slot.style.justifyContent = 'center'
    slot.style.position = 'relative'

    const label = document.createElement('div')
    label.textContent = String((i + 1) % 10)
    label.style.position = 'absolute'
    label.style.bottom = '2px'
    label.style.right = '4px'
    label.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    label.style.fontSize = '0.55rem'
    label.style.color = 'rgba(255, 255, 255, 0.7)'
    label.style.pointerEvents = 'none'

    slot.appendChild(label)
    slots.push(slot)
    root.appendChild(slot)
  }

  parent.appendChild(root)

  let selectedIndex = 0

  const applySelection = (index: number): void => {
    if (index < 0 || index >= slots.length) return

    slots.forEach((slot, i) => {
      if (i === index) {
        slot.style.border = selectedBorder
        slot.style.boxShadow =
          '0 0 6px rgba(255, 255, 255, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.9)'
      } else {
        slot.style.border = normalBorder
        slot.style.boxShadow =
          'inset 0 0 0 1px rgba(0, 0, 0, 0.6)'
      }
    })

    selectedIndex = index
  }

  applySelection(selectedIndex)

  return {
    root,
    slots,
    updateSelectedSlot(index: number): void {
      applySelection(index)
    },
    destroy(): void {
      if (root.parentElement === parent) {
        parent.removeChild(root)
      }
    },
    syncFromState(stateSlots: ReadonlyArray<IItem | null>): void {
      syncSlotsFromState(slots, stateSlots)
    },
  }
}

