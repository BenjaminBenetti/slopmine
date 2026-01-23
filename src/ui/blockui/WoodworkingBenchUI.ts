import type { IBlockUI } from './interfaces/IBlockUI.ts'
import type { IItemStack } from '../../player/PlayerState.ts'
import type { WoodworkingBenchState } from '../../world/blocks/types/woodworking_bench/WoodworkingBenchState.ts'
import type { IWoodworkingRecipe } from '../../woodworking/interfaces/IWoodworkingRecipe.ts'
import { syncSlotsFromState } from '../SlotRenderer.ts'

/**
 * UI panel for the Woodworking Bench block.
 * Shows input slot, available recipes with craft buttons, and output slots.
 *
 * Layout (4 slots total):
 * - Slot 0: Input (left)
 * - Slots 1-3: Output (right)
 *
 * Visual layout:
 *   Input      Recipes       Output
 *  [Slot 0]   Recipe 1     [Slot 1]
 *             [Craft]      [Slot 2]
 *             Recipe 2     [Slot 3]
 *             [Craft]
 */
export function createWoodworkingBenchUI(state: WoodworkingBenchState): IBlockUI {
  const slotSize = 44
  let isOpen = false

  // Track recipe buttons for updates
  const recipeButtons: HTMLButtonElement[] = []

  // Main container
  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.gap = '0.75rem'
  root.style.padding = '1rem'
  root.style.background = 'rgba(12, 12, 12, 0.96)'
  root.style.borderRadius = '8px'
  root.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  root.style.minWidth = '320px'

  // Title
  const title = document.createElement('div')
  title.textContent = 'Woodworking Bench'
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

  // Main crafting row: Input | Recipes | Output
  const craftingRow = document.createElement('div')
  craftingRow.style.display = 'flex'
  craftingRow.style.alignItems = 'flex-start'
  craftingRow.style.justifyContent = 'center'
  craftingRow.style.gap = '1rem'

  // Input section
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

  const inputSlot = createSlot()
  inputSection.appendChild(inputSlot)

  craftingRow.appendChild(inputSection)

  // Recipes section (scrollable if many recipes)
  const recipesSection = document.createElement('div')
  recipesSection.style.display = 'flex'
  recipesSection.style.flexDirection = 'column'
  recipesSection.style.alignItems = 'center'
  recipesSection.style.gap = '0.5rem'
  recipesSection.style.minWidth = '120px'
  recipesSection.style.maxHeight = '180px'
  recipesSection.style.overflowY = 'auto'

  const recipesLabel = document.createElement('div')
  recipesLabel.textContent = 'Recipes'
  recipesLabel.style.color = 'rgba(255, 255, 255, 0.7)'
  recipesLabel.style.fontFamily = 'system-ui, sans-serif'
  recipesLabel.style.fontSize = '0.7rem'
  recipesLabel.style.marginBottom = '0.25rem'
  recipesSection.appendChild(recipesLabel)

  // Recipes container (will be populated dynamically)
  const recipesContainer = document.createElement('div')
  recipesContainer.style.display = 'flex'
  recipesContainer.style.flexDirection = 'column'
  recipesContainer.style.gap = '0.5rem'
  recipesContainer.style.width = '100%'
  recipesSection.appendChild(recipesContainer)

  // No recipes message
  const noRecipesMsg = document.createElement('div')
  noRecipesMsg.textContent = 'Add wood to see recipes'
  noRecipesMsg.style.color = 'rgba(255, 255, 255, 0.4)'
  noRecipesMsg.style.fontFamily = 'system-ui, sans-serif'
  noRecipesMsg.style.fontSize = '0.65rem'
  noRecipesMsg.style.textAlign = 'center'
  noRecipesMsg.style.padding = '0.5rem'
  recipesContainer.appendChild(noRecipesMsg)

  craftingRow.appendChild(recipesSection)

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

  craftingRow.appendChild(outputSection)
  root.appendChild(craftingRow)

  // Collect all slots in order: input (0), output (1-3)
  const allSlots = [inputSlot, ...outputSlots]

  // Build state slots array for syncing
  function getStateSlots(): ReadonlyArray<IItemStack | null> {
    const slots: (IItemStack | null)[] = []
    for (let i = 0; i < 4; i++) {
      slots.push(state.getStack(i))
    }
    return slots
  }

  // Create a recipe entry element
  function createRecipeEntry(recipe: IWoodworkingRecipe): HTMLDivElement {
    const entry = document.createElement('div')
    entry.style.display = 'flex'
    entry.style.flexDirection = 'column'
    entry.style.alignItems = 'center'
    entry.style.gap = '0.25rem'
    entry.style.padding = '0.5rem'
    entry.style.background = 'rgba(40, 40, 40, 0.6)'
    entry.style.borderRadius = '4px'
    entry.style.border = '1px solid rgba(255, 255, 255, 0.1)'

    // Recipe name
    const name = document.createElement('div')
    name.textContent = recipe.name
    name.style.color = 'rgba(255, 255, 255, 0.8)'
    name.style.fontFamily = 'system-ui, sans-serif'
    name.style.fontSize = '0.7rem'
    entry.appendChild(name)

    // Recipe info (input x count -> output x count)
    const info = document.createElement('div')
    info.textContent = `${recipe.inputCount} \u2192 ${recipe.resultCount}`
    info.style.color = 'rgba(255, 255, 255, 0.5)'
    info.style.fontFamily = 'system-ui, sans-serif'
    info.style.fontSize = '0.6rem'
    entry.appendChild(info)

    // Craft button
    const craftBtn = document.createElement('button')
    craftBtn.textContent = 'Craft'
    craftBtn.style.padding = '0.25rem 0.75rem'
    craftBtn.style.background = 'rgba(139, 90, 43, 0.8)'
    craftBtn.style.border = '1px solid rgba(255, 255, 255, 0.3)'
    craftBtn.style.borderRadius = '3px'
    craftBtn.style.color = 'white'
    craftBtn.style.fontFamily = 'system-ui, sans-serif'
    craftBtn.style.fontSize = '0.7rem'
    craftBtn.style.cursor = 'pointer'
    craftBtn.style.transition = 'background 0.15s'

    craftBtn.addEventListener('mouseenter', () => {
      if (!craftBtn.disabled) {
        craftBtn.style.background = 'rgba(169, 120, 73, 0.9)'
      }
    })
    craftBtn.addEventListener('mouseleave', () => {
      if (!craftBtn.disabled) {
        craftBtn.style.background = 'rgba(139, 90, 43, 0.8)'
      }
    })

    craftBtn.addEventListener('click', () => {
      if (state.craft(recipe)) {
        // Refresh UI after crafting
        updateRecipes()
        syncSlotsFromState(allSlots, getStateSlots())
      }
    })

    // Store recipe reference for updating enabled state
    ;(craftBtn as any).__recipe = recipe
    recipeButtons.push(craftBtn)

    entry.appendChild(craftBtn)
    return entry
  }

  // Update recipes display based on current input
  function updateRecipes(): void {
    // Clear existing recipes
    recipesContainer.innerHTML = ''
    recipeButtons.length = 0

    const recipes = state.getAvailableRecipes()

    if (recipes.length === 0) {
      recipesContainer.appendChild(noRecipesMsg)
      return
    }

    for (const recipe of recipes) {
      const entry = createRecipeEntry(recipe)
      recipesContainer.appendChild(entry)
    }

    // Update button states
    updateCraftButtons()
  }

  // Update craft button enabled/disabled states
  function updateCraftButtons(): void {
    for (const btn of recipeButtons) {
      const recipe = (btn as any).__recipe as IWoodworkingRecipe
      const canCraft = state.canCraft(recipe)
      btn.disabled = !canCraft
      btn.style.opacity = canCraft ? '1' : '0.5'
      btn.style.cursor = canCraft ? 'pointer' : 'not-allowed'
    }
  }

  const api: IBlockUI = {
    root,
    slots: allSlots,

    open(): void {
      isOpen = true
      updateRecipes()
    },

    close(): void {
      isOpen = false
    },

    syncFromState(): void {
      if (!isOpen) return

      // Sync slot contents
      syncSlotsFromState(allSlots, getStateSlots())

      // Update recipes if input changed
      updateRecipes()
    },

    getStack(index: number): IItemStack | null {
      return state.getStack(index)
    },

    setStack(index: number, stack: IItemStack | null): void {
      state.setStack(index, stack)
      // Trigger recipe update when input changes
      if (index === 0) {
        updateRecipes()
      }
    },

    destroy(): void {
      if (root.parentElement) {
        root.parentElement.removeChild(root)
      }
    },
  }

  return api
}
