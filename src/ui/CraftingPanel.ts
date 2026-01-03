import type { IItemStack } from '../player/PlayerState.ts'
import type { IRecipe } from '../crafting/RecipeRegistry.ts'
import { syncSlotsFromState } from './SlotRenderer.ts'

export interface CraftingPanelOptions {
  slotSizePx?: number
}

export interface CraftingPanelUI {
  readonly root: HTMLDivElement
  readonly craftingSlots: HTMLDivElement[]
  readonly craftableList: HTMLDivElement

  /** Update the list of craftable items */
  updateCraftableList(recipes: IRecipe[]): void

  /** Set callback for when a craftable item is clicked */
  onCraft(callback: (recipe: IRecipe) => void): void

  /** Sync crafting slots from state */
  syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void

  destroy(): void
}

/**
 * Creates the crafting panel UI with:
 * - Top: 3x2 grid of crafting slots
 * - Bottom: Scrollable list of craftable items
 */
export function createCraftingPanelUI(options: CraftingPanelOptions = {}): CraftingPanelUI {
  const slotSize = options.slotSizePx ?? 44

  // Main container
  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.gap = '1rem'
  root.style.padding = '1rem'
  root.style.background = 'rgba(12, 12, 12, 0.96)'
  root.style.borderRadius = '8px'
  root.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  root.style.minWidth = '180px'

  // Section label: Crafting
  const craftingLabel = document.createElement('div')
  craftingLabel.textContent = 'Crafting'
  craftingLabel.style.color = 'rgba(255, 255, 255, 0.9)'
  craftingLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  craftingLabel.style.fontSize = '0.85rem'
  craftingLabel.style.fontWeight = 'bold'
  craftingLabel.style.marginBottom = '0.25rem'
  root.appendChild(craftingLabel)

  // Crafting grid (3x2)
  const craftingGrid = document.createElement('div')
  craftingGrid.style.display = 'grid'
  craftingGrid.style.gridTemplateColumns = `repeat(3, ${slotSize}px)`
  craftingGrid.style.gap = '0.4rem'

  const craftingSlots: HTMLDivElement[] = []

  for (let i = 0; i < 6; i++) {
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

    craftingSlots.push(slot)
    craftingGrid.appendChild(slot)
  }

  root.appendChild(craftingGrid)

  // Divider
  const divider = document.createElement('div')
  divider.style.height = '1px'
  divider.style.background = 'rgba(255, 255, 255, 0.2)'
  divider.style.margin = '0.5rem 0'
  root.appendChild(divider)

  // Section label: Craftable
  const craftableLabel = document.createElement('div')
  craftableLabel.textContent = 'Craftable'
  craftableLabel.style.color = 'rgba(255, 255, 255, 0.9)'
  craftableLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  craftableLabel.style.fontSize = '0.85rem'
  craftableLabel.style.fontWeight = 'bold'
  craftableLabel.style.marginBottom = '0.25rem'
  root.appendChild(craftableLabel)

  // Craftable items list
  const craftableList = document.createElement('div')
  craftableList.style.display = 'flex'
  craftableList.style.flexDirection = 'column'
  craftableList.style.gap = '0.3rem'
  craftableList.style.maxHeight = '200px'
  craftableList.style.overflowY = 'auto'
  craftableList.style.minHeight = '60px'
  root.appendChild(craftableList)

  let craftCallback: ((recipe: IRecipe) => void) | null = null

  const api: CraftingPanelUI = {
    root,
    craftingSlots,
    craftableList,

    updateCraftableList(recipes: IRecipe[]): void {
      craftableList.innerHTML = ''

      if (recipes.length === 0) {
        const emptyMsg = document.createElement('div')
        emptyMsg.textContent = 'No recipes available'
        emptyMsg.style.color = 'rgba(255, 255, 255, 0.4)'
        emptyMsg.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
        emptyMsg.style.fontSize = '0.75rem'
        emptyMsg.style.fontStyle = 'italic'
        craftableList.appendChild(emptyMsg)
        return
      }

      for (const recipe of recipes) {
        const item = document.createElement('div')
        item.style.display = 'flex'
        item.style.alignItems = 'center'
        item.style.gap = '0.5rem'
        item.style.padding = '0.4rem 0.5rem'
        item.style.background = 'rgba(40, 40, 40, 0.8)'
        item.style.borderRadius = '4px'
        item.style.cursor = 'pointer'
        item.style.transition = 'background 0.15s'

        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(60, 60, 60, 0.9)'
        })
        item.addEventListener('mouseleave', () => {
          item.style.background = 'rgba(40, 40, 40, 0.8)'
        })

        // Recipe icon (preview of result)
        const resultItem = recipe.createResult()
        if (resultItem.iconUrl) {
          const icon = document.createElement('img')
          icon.src = resultItem.iconUrl
          icon.style.width = '24px'
          icon.style.height = '24px'
          icon.style.objectFit = 'contain'
          icon.style.imageRendering = 'pixelated'
          icon.draggable = false
          item.appendChild(icon)
        }

        // Recipe name
        const name = document.createElement('span')
        name.textContent = recipe.name
        name.style.color = 'rgba(255, 255, 255, 0.9)'
        name.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
        name.style.fontSize = '0.8rem'
        item.appendChild(name)

        item.addEventListener('click', () => {
          craftCallback?.(recipe)
        })

        craftableList.appendChild(item)
      }
    },

    onCraft(callback: (recipe: IRecipe) => void): void {
      craftCallback = callback
    },

    syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void {
      syncSlotsFromState(craftingSlots, stateSlots)
    },

    destroy(): void {
      if (root.parentElement) {
        root.parentElement.removeChild(root)
      }
    },
  }

  // Initialize with empty list
  api.updateCraftableList([])

  return api
}
