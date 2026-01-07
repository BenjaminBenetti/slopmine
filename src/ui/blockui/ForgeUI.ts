import type { IBlockUI } from './interfaces/IBlockUI.ts'
import type { IItemStack } from '../../player/PlayerState.ts'
import type { ForgeBlockState } from '../../world/blocks/types/forge/ForgeBlockState.ts'
import { syncSlotsFromState } from '../SlotRenderer.ts'

/**
 * UI panel for the Forge block.
 * Shows ore input slots, fuel slot, progress bars, and output slots.
 *
 * Layout (7 slots total):
 * - Slots 0-2: Ore input (left column)
 * - Slot 3: Fuel (bottom)
 * - Slots 4-6: Output (right column)
 *
 * Visual layout:
 *   Input     Progress    Output
 *  [Slot 0]     ║▓▓║     [Slot 4]
 *  [Slot 1]     ║▓▓║     [Slot 5]
 *  [Slot 2]     ║  ║     [Slot 6]
 *
 *  Fuel: [Slot 3] [======    ]
 */
export function createForgeUI(state: ForgeBlockState): IBlockUI {
  const slotSize = 44
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
  title.textContent = 'Forge'
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

  // Main smelting row: Input | Progress | Output
  const smeltingRow = document.createElement('div')
  smeltingRow.style.display = 'flex'
  smeltingRow.style.alignItems = 'center'
  smeltingRow.style.justifyContent = 'center'
  smeltingRow.style.gap = '1rem'

  // Input column
  const inputSection = document.createElement('div')
  inputSection.style.display = 'flex'
  inputSection.style.flexDirection = 'column'
  inputSection.style.alignItems = 'center'
  inputSection.style.gap = '0.25rem'

  const inputLabel = document.createElement('div')
  inputLabel.textContent = 'Input'
  inputLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  inputLabel.style.fontFamily = 'system-ui, sans-serif'
  inputLabel.style.fontSize = '0.7rem'
  inputLabel.style.marginBottom = '0.25rem'
  inputSection.appendChild(inputLabel)

  const oreSlots: HTMLDivElement[] = []
  for (let i = 0; i < 3; i++) {
    const slot = createSlot()
    oreSlots.push(slot)
    inputSection.appendChild(slot)
    if (i < 2) {
      // Add small gap between slots
      const spacer = document.createElement('div')
      spacer.style.height = '0.25rem'
      inputSection.appendChild(spacer)
    }
  }
  smeltingRow.appendChild(inputSection)

  // Vertical progress bar section
  const progressSection = document.createElement('div')
  progressSection.style.display = 'flex'
  progressSection.style.flexDirection = 'column'
  progressSection.style.alignItems = 'center'
  progressSection.style.justifyContent = 'center'
  progressSection.style.padding = '0 0.5rem'

  // Arrow pointing right
  const arrowTop = document.createElement('div')
  arrowTop.textContent = '→'
  arrowTop.style.color = 'rgba(255, 255, 255, 0.4)'
  arrowTop.style.fontSize = '1.2rem'
  arrowTop.style.marginBottom = '0.25rem'
  progressSection.appendChild(arrowTop)

  // Vertical progress bar container
  const progressBarBg = document.createElement('div')
  const progressBarHeight = slotSize * 3 + 16 // Height to match 3 slots + gaps
  progressBarBg.style.width = '16px'
  progressBarBg.style.height = `${progressBarHeight}px`
  progressBarBg.style.background = 'rgba(40, 40, 40, 0.8)'
  progressBarBg.style.borderRadius = '4px'
  progressBarBg.style.overflow = 'hidden'
  progressBarBg.style.position = 'relative'
  progressBarBg.style.border = '1px solid rgba(255, 255, 255, 0.1)'

  // Progress fill (fills from bottom to top)
  const progressBarFill = document.createElement('div')
  progressBarFill.style.width = '100%'
  progressBarFill.style.height = '0%'
  progressBarFill.style.background = 'linear-gradient(to top, #ff6600, #ffaa00)'
  progressBarFill.style.position = 'absolute'
  progressBarFill.style.bottom = '0'
  progressBarFill.style.left = '0'
  progressBarFill.style.transition = 'height 0.1s'
  progressBarBg.appendChild(progressBarFill)

  progressSection.appendChild(progressBarBg)

  // Arrow pointing right (bottom)
  const arrowBottom = document.createElement('div')
  arrowBottom.textContent = '→'
  arrowBottom.style.color = 'rgba(255, 255, 255, 0.4)'
  arrowBottom.style.fontSize = '1.2rem'
  arrowBottom.style.marginTop = '0.25rem'
  progressSection.appendChild(arrowBottom)

  smeltingRow.appendChild(progressSection)

  // Output column
  const outputSection = document.createElement('div')
  outputSection.style.display = 'flex'
  outputSection.style.flexDirection = 'column'
  outputSection.style.alignItems = 'center'
  outputSection.style.gap = '0.25rem'

  const outputLabel = document.createElement('div')
  outputLabel.textContent = 'Output'
  outputLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  outputLabel.style.fontFamily = 'system-ui, sans-serif'
  outputLabel.style.fontSize = '0.7rem'
  outputLabel.style.marginBottom = '0.25rem'
  outputSection.appendChild(outputLabel)

  const outputSlots: HTMLDivElement[] = []
  for (let i = 0; i < 3; i++) {
    const slot = createSlot()
    outputSlots.push(slot)
    outputSection.appendChild(slot)
    if (i < 2) {
      const spacer = document.createElement('div')
      spacer.style.height = '0.25rem'
      outputSection.appendChild(spacer)
    }
  }
  smeltingRow.appendChild(outputSection)

  root.appendChild(smeltingRow)

  // Divider
  const divider = document.createElement('div')
  divider.style.height = '1px'
  divider.style.background = 'rgba(255, 255, 255, 0.1)'
  divider.style.margin = '0.5rem 0'
  root.appendChild(divider)

  // Fuel section (bottom, centered)
  const fuelSection = document.createElement('div')
  fuelSection.style.display = 'flex'
  fuelSection.style.alignItems = 'center'
  fuelSection.style.justifyContent = 'center'
  fuelSection.style.gap = '0.75rem'

  const fuelLabel = document.createElement('div')
  fuelLabel.textContent = 'Fuel'
  fuelLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  fuelLabel.style.fontFamily = 'system-ui, sans-serif'
  fuelLabel.style.fontSize = '0.7rem'
  fuelSection.appendChild(fuelLabel)

  const fuelSlot = createSlot()
  fuelSection.appendChild(fuelSlot)

  // Horizontal fuel bar
  const fuelBarBg = document.createElement('div')
  fuelBarBg.style.width = '80px'
  fuelBarBg.style.height = '10px'
  fuelBarBg.style.background = 'rgba(40, 40, 40, 0.8)'
  fuelBarBg.style.borderRadius = '3px'
  fuelBarBg.style.overflow = 'hidden'
  fuelBarBg.style.border = '1px solid rgba(255, 255, 255, 0.1)'

  const fuelBarFill = document.createElement('div')
  fuelBarFill.style.width = '0%'
  fuelBarFill.style.height = '100%'
  fuelBarFill.style.background = 'linear-gradient(to right, #cc3300, #ff6600)'
  fuelBarFill.style.transition = 'width 0.1s'
  fuelBarBg.appendChild(fuelBarFill)
  fuelSection.appendChild(fuelBarBg)

  root.appendChild(fuelSection)

  // Collect all slots in order: ore (0-2), fuel (3), output (4-6)
  const allSlots = [...oreSlots, fuelSlot, ...outputSlots]

  // Build state slots array for syncing
  function getStateSlots(): ReadonlyArray<IItemStack | null> {
    const slots: (IItemStack | null)[] = []
    for (let i = 0; i < 7; i++) {
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

      // Update progress bars
      const smeltProgress = state.getSmeltProgress()
      const fuelProgress = state.getFuelProgress()

      // Vertical progress bar fills from bottom to top
      progressBarFill.style.height = `${smeltProgress * 100}%`
      fuelBarFill.style.width = `${fuelProgress * 100}%`
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
