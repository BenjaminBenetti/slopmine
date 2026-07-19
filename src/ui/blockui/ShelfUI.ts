import type { IBlockUI } from './interfaces/IBlockUI.ts'
import type { IItemStack } from '../../player/PlayerState.ts'
import type { ShelfBlockState } from '../../world/blocks/types/shelf_shared/ShelfBlockState.ts'
import { SHELF_SLOT_COUNT } from '../../world/blocks/types/shelf_shared/ShelfBlockState.ts'
import { syncSlotsFromState } from '../SlotRenderer.ts'

/**
 * UI panel for the Shelf block (all wood variants).
 * Shows a single row of 3 display slots.
 *
 * Layout (3 slots total):
 *   Row 0: [0] [1] [2]
 */
export function createShelfUI(state: ShelfBlockState): IBlockUI {
  const slotSize = 44
  const slotGap = 4
  let isOpen = false

  // Main container
  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.gap = '0.75rem'
  root.style.padding = '1rem'
  root.style.background = 'rgba(12, 12, 12, 0.96)'
  root.style.borderRadius = '8px'
  root.style.border = '2px solid rgba(255, 255, 255, 0.18)'

  // Title
  const title = document.createElement('div')
  title.textContent = 'Shelf'
  title.style.color = 'rgba(255, 255, 255, 0.9)'
  title.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  title.style.fontSize = '0.85rem'
  title.style.fontWeight = 'bold'
  title.style.textAlign = 'center'
  title.style.marginBottom = '0.5rem'
  root.appendChild(title)

  // Create a slot element
  function createSlot(): HTMLDivElement {
    const slot = document.createElement('div')
    slot.style.width = `${slotSize}px`
    slot.style.height = `${slotSize}px`
    slot.style.background = 'rgba(8, 8, 8, 0.98)'
    slot.style.border = '2px solid rgba(255, 255, 255, 0.35)'
    slot.style.borderRadius = '4px'
    slot.style.boxShadow = 'inset 0 0 0 1px rgba(0, 0, 0, 0.7)'
    slot.style.display = 'flex'
    slot.style.alignItems = 'center'
    slot.style.justifyContent = 'center'
    slot.style.position = 'relative'
    return slot
  }

  // Row container
  const rowContainer = document.createElement('div')
  rowContainer.style.display = 'grid'
  rowContainer.style.gridTemplateColumns = `repeat(${SHELF_SLOT_COUNT}, ${slotSize}px)`
  rowContainer.style.gap = `${slotGap}px`
  rowContainer.style.justifyContent = 'center'

  // Create all 3 slots
  const allSlots: HTMLDivElement[] = []
  for (let i = 0; i < SHELF_SLOT_COUNT; i++) {
    const slot = createSlot()
    allSlots.push(slot)
    rowContainer.appendChild(slot)
  }

  root.appendChild(rowContainer)

  // Build state slots array for syncing
  function getStateSlots(): ReadonlyArray<IItemStack | null> {
    const slots: (IItemStack | null)[] = []
    for (let i = 0; i < SHELF_SLOT_COUNT; i++) {
      slots.push(state.getStack(i))
    }
    return slots
  }

  const api: IBlockUI = {
    root,
    slots: allSlots,

    open(): void {
      isOpen = true
    },

    close(): void {
      isOpen = false
    },

    syncFromState(): void {
      if (!isOpen) return

      // Sync slot contents
      syncSlotsFromState(allSlots, getStateSlots())
    },

    getStack(index: number): IItemStack | null {
      return state.getStack(index)
    },

    setStack(index: number, stack: IItemStack | null): void {
      state.setStack(index, stack)
    },

    destroy(): void {
      if (root.parentElement) {
        root.parentElement.removeChild(root)
      }
    },
  }

  return api
}
