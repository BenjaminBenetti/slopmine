import type { IBlockUI } from './interfaces/IBlockUI.ts'
import type { IItemStack } from '../../player/PlayerState.ts'
import type { ForgeBlockState } from '../../world/blocks/types/forge/ForgeBlockState.ts'
import { syncSlotsFromState } from '../SlotRenderer.ts'

/**
 * UI panel for the Forge block.
 * Shows ore input slots, fuel slot, progress bars, and output slots.
 *
 * Layout (7 slots total):
 * - Slots 0-2: Ore input (top row)
 * - Slot 3: Fuel (bottom left)
 * - Slots 4-6: Output (bottom right)
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
  root.style.minWidth = '200px'

  // Title
  const title = document.createElement('div')
  title.textContent = 'Forge'
  title.style.color = 'rgba(255, 255, 255, 0.9)'
  title.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  title.style.fontSize = '0.85rem'
  title.style.fontWeight = 'bold'
  title.style.marginBottom = '0.25rem'
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

  // Ore input section (top)
  const oreLabel = document.createElement('div')
  oreLabel.textContent = 'Ore Input'
  oreLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  oreLabel.style.fontFamily = 'system-ui, sans-serif'
  oreLabel.style.fontSize = '0.75rem'
  root.appendChild(oreLabel)

  const oreRow = document.createElement('div')
  oreRow.style.display = 'flex'
  oreRow.style.gap = '0.4rem'

  const oreSlots: HTMLDivElement[] = []
  for (let i = 0; i < 3; i++) {
    const slot = createSlot()
    oreSlots.push(slot)
    oreRow.appendChild(slot)
  }
  root.appendChild(oreRow)

  // Progress arrow
  const progressContainer = document.createElement('div')
  progressContainer.style.display = 'flex'
  progressContainer.style.alignItems = 'center'
  progressContainer.style.justifyContent = 'center'
  progressContainer.style.padding = '0.5rem 0'

  const progressBarBg = document.createElement('div')
  progressBarBg.style.width = '100px'
  progressBarBg.style.height = '12px'
  progressBarBg.style.background = 'rgba(40, 40, 40, 0.8)'
  progressBarBg.style.borderRadius = '3px'
  progressBarBg.style.overflow = 'hidden'
  progressBarBg.style.position = 'relative'

  const progressBarFill = document.createElement('div')
  progressBarFill.style.width = '0%'
  progressBarFill.style.height = '100%'
  progressBarFill.style.background = 'linear-gradient(to right, #ff6600, #ffaa00)'
  progressBarFill.style.transition = 'width 0.1s'
  progressBarBg.appendChild(progressBarFill)

  const arrowText = document.createElement('span')
  arrowText.textContent = ' → '
  arrowText.style.color = 'rgba(255, 255, 255, 0.5)'
  arrowText.style.fontSize = '1.5rem'

  progressContainer.appendChild(progressBarBg)
  progressContainer.appendChild(arrowText)
  root.appendChild(progressContainer)

  // Bottom row: Fuel + Output
  const bottomRow = document.createElement('div')
  bottomRow.style.display = 'flex'
  bottomRow.style.gap = '1rem'
  bottomRow.style.alignItems = 'flex-end'

  // Fuel section
  const fuelSection = document.createElement('div')
  fuelSection.style.display = 'flex'
  fuelSection.style.flexDirection = 'column'
  fuelSection.style.gap = '0.25rem'

  const fuelLabel = document.createElement('div')
  fuelLabel.textContent = 'Fuel'
  fuelLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  fuelLabel.style.fontFamily = 'system-ui, sans-serif'
  fuelLabel.style.fontSize = '0.75rem'
  fuelSection.appendChild(fuelLabel)

  const fuelSlot = createSlot()
  fuelSection.appendChild(fuelSlot)

  // Fuel bar
  const fuelBarBg = document.createElement('div')
  fuelBarBg.style.width = `${slotSize}px`
  fuelBarBg.style.height = '6px'
  fuelBarBg.style.background = 'rgba(40, 40, 40, 0.8)'
  fuelBarBg.style.borderRadius = '2px'
  fuelBarBg.style.overflow = 'hidden'
  fuelBarBg.style.marginTop = '0.25rem'

  const fuelBarFill = document.createElement('div')
  fuelBarFill.style.width = '0%'
  fuelBarFill.style.height = '100%'
  fuelBarFill.style.background = 'linear-gradient(to right, #cc3300, #ff6600)'
  fuelBarFill.style.transition = 'width 0.1s'
  fuelBarBg.appendChild(fuelBarFill)
  fuelSection.appendChild(fuelBarBg)

  bottomRow.appendChild(fuelSection)

  // Output section
  const outputSection = document.createElement('div')
  outputSection.style.display = 'flex'
  outputSection.style.flexDirection = 'column'
  outputSection.style.gap = '0.25rem'

  const outputLabel = document.createElement('div')
  outputLabel.textContent = 'Output'
  outputLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  outputLabel.style.fontFamily = 'system-ui, sans-serif'
  outputLabel.style.fontSize = '0.75rem'
  outputSection.appendChild(outputLabel)

  const outputRow = document.createElement('div')
  outputRow.style.display = 'flex'
  outputRow.style.gap = '0.4rem'

  const outputSlots: HTMLDivElement[] = []
  for (let i = 0; i < 3; i++) {
    const slot = createSlot()
    outputSlots.push(slot)
    outputRow.appendChild(slot)
  }
  outputSection.appendChild(outputRow)
  bottomRow.appendChild(outputSection)

  root.appendChild(bottomRow)

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

      progressBarFill.style.width = `${smeltProgress * 100}%`
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
