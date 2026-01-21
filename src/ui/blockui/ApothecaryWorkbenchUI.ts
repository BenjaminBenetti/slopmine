import type { IBlockUI } from './interfaces/IBlockUI.ts'
import type { IItemStack } from '../../player/PlayerState.ts'
import type { ApothecaryWorkbenchState } from '../../world/blocks/types/apothecary_workbench/ApothecaryWorkbenchState.ts'
import { syncSlotsFromState } from '../SlotRenderer.ts'

/**
 * UI panel for the Apothecary Workbench block.
 * Shows ingredient input slots (2x2 grid), fuel slot, progress bars, and output slot.
 *
 * Layout (6 slots total):
 * - Slots 0-3: Ingredient input (2x2 grid)
 * - Slot 4: Fuel (bottom)
 * - Slot 5: Output (right side)
 *
 * Visual layout:
 *   Ingredients (2x2)    Brewing     Output
 *     [Slot 0] [Slot 1]    ║▓▓║     [Slot 5]
 *     [Slot 2] [Slot 3]    ║  ║
 *
 *   Fuel: [Slot 4] [======    ]
 */
export function createApothecaryWorkbenchUI(state: ApothecaryWorkbenchState): IBlockUI {
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
  title.textContent = 'Apothecary Workbench'
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

  // Main brewing row: Ingredients | Progress | Output
  const brewingRow = document.createElement('div')
  brewingRow.style.display = 'flex'
  brewingRow.style.alignItems = 'center'
  brewingRow.style.justifyContent = 'center'
  brewingRow.style.gap = '1rem'

  // Ingredients section (2x2 grid)
  const ingredientsSection = document.createElement('div')
  ingredientsSection.style.display = 'flex'
  ingredientsSection.style.flexDirection = 'column'
  ingredientsSection.style.alignItems = 'center'
  ingredientsSection.style.gap = '0.25rem'

  const ingredientsLabel = document.createElement('div')
  ingredientsLabel.textContent = 'Ingredients'
  ingredientsLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  ingredientsLabel.style.fontFamily = 'system-ui, sans-serif'
  ingredientsLabel.style.fontSize = '0.7rem'
  ingredientsLabel.style.marginBottom = '0.25rem'
  ingredientsSection.appendChild(ingredientsLabel)

  // 2x2 grid container
  const ingredientGrid = document.createElement('div')
  ingredientGrid.style.display = 'grid'
  ingredientGrid.style.gridTemplateColumns = `repeat(2, ${slotSize}px)`
  ingredientGrid.style.gridTemplateRows = `repeat(2, ${slotSize}px)`
  ingredientGrid.style.gap = '4px'

  const ingredientSlots: HTMLDivElement[] = []
  for (let i = 0; i < 4; i++) {
    const slot = createSlot()
    ingredientSlots.push(slot)
    ingredientGrid.appendChild(slot)
  }
  ingredientsSection.appendChild(ingredientGrid)
  brewingRow.appendChild(ingredientsSection)

  // Vertical progress bar section (brewing progress)
  const progressSection = document.createElement('div')
  progressSection.style.display = 'flex'
  progressSection.style.flexDirection = 'column'
  progressSection.style.alignItems = 'center'
  progressSection.style.justifyContent = 'center'
  progressSection.style.padding = '0 0.5rem'

  // Arrow pointing right
  const arrowTop = document.createElement('div')
  arrowTop.textContent = '\u2192'
  arrowTop.style.color = 'rgba(255, 255, 255, 0.4)'
  arrowTop.style.fontSize = '1.2rem'
  arrowTop.style.marginBottom = '0.25rem'
  progressSection.appendChild(arrowTop)

  // Vertical progress bar container
  const progressBarBg = document.createElement('div')
  const progressBarHeight = slotSize * 2 + 4 // Height to match 2x2 grid
  progressBarBg.style.width = '16px'
  progressBarBg.style.height = `${progressBarHeight}px`
  progressBarBg.style.background = 'rgba(40, 40, 40, 0.8)'
  progressBarBg.style.borderRadius = '4px'
  progressBarBg.style.overflow = 'hidden'
  progressBarBg.style.position = 'relative'
  progressBarBg.style.border = '1px solid rgba(255, 255, 255, 0.1)'

  // Progress fill (fills from bottom to top) - purple/magenta for brewing
  const progressBarFill = document.createElement('div')
  progressBarFill.style.width = '100%'
  progressBarFill.style.height = '0%'
  progressBarFill.style.background = 'linear-gradient(to top, #6b21a8, #a855f7)'
  progressBarFill.style.position = 'absolute'
  progressBarFill.style.bottom = '0'
  progressBarFill.style.left = '0'
  progressBarFill.style.transition = 'height 0.1s'
  progressBarBg.appendChild(progressBarFill)

  progressSection.appendChild(progressBarBg)

  // Arrow pointing right (bottom)
  const arrowBottom = document.createElement('div')
  arrowBottom.textContent = '\u2192'
  arrowBottom.style.color = 'rgba(255, 255, 255, 0.4)'
  arrowBottom.style.fontSize = '1.2rem'
  arrowBottom.style.marginTop = '0.25rem'
  progressSection.appendChild(arrowBottom)

  brewingRow.appendChild(progressSection)

  // Output section
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

  const outputSlot = createSlot()
  // Make output slot slightly larger to emphasize it
  outputSlot.style.width = `${slotSize + 8}px`
  outputSlot.style.height = `${slotSize + 8}px`
  outputSlot.style.border = '2px solid rgba(168, 85, 247, 0.5)'
  outputSection.appendChild(outputSlot)

  brewingRow.appendChild(outputSection)

  root.appendChild(brewingRow)

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

  // Collect all slots in order: ingredients (0-3), fuel (4), output (5)
  const allSlots = [...ingredientSlots, fuelSlot, outputSlot]

  // Build state slots array for syncing
  function getStateSlots(): ReadonlyArray<IItemStack | null> {
    const slots: (IItemStack | null)[] = []
    for (let i = 0; i < 6; i++) {
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
      const brewProgress = state.getBrewProgress()
      const fuelProgress = state.getFuelProgress()

      // Vertical progress bar fills from bottom to top
      progressBarFill.style.height = `${brewProgress * 100}%`
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
