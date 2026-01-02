import type { IItemStack } from '../player/PlayerState.ts'
import type { IItem } from '../items/Item.ts'
import { syncSlotsFromState, renderStackInSlot } from './SlotRenderer.ts'
import { RecipeRegistry } from '../items/RecipeRegistry.ts'

export interface InventoryUIOptions {
  columns?: number
  rows?: number
  slotSizePx?: number
  craftingSlots?: number
}

export interface InventoryUI {
  readonly root: HTMLDivElement
  readonly panel: HTMLDivElement
  readonly slots: HTMLDivElement[]
  readonly craftingSlots: HTMLDivElement[]
  readonly isOpen: boolean
  open(): void
  close(): void
  toggle(): void
  destroy(): void
  syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void
  updateCraftingRecipes(craftingInputs: ReadonlyArray<IItem | null>): void
}

/**
 * Grid-based inventory overlay with crafting panel.
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
  const craftingSlotCount = options.craftingSlots ?? 4

  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'
  overlay.style.background = 'rgba(0, 0, 0, 0.45)'
  overlay.style.zIndex = '35'

  // Container for both panels
  const panelContainer = document.createElement('div')
  panelContainer.style.display = 'flex'
  panelContainer.style.gap = '1rem'
  panelContainer.style.alignItems = 'flex-start'

  // Main inventory panel (left)
  const panel = document.createElement('div')
  panel.style.background = 'rgba(12, 12, 12, 0.96)'
  panel.style.borderRadius = '8px'
  panel.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  panel.style.boxShadow = '0 0 14px rgba(0, 0, 0, 0.95)'
  panel.style.padding = '1rem 1.25rem'

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

  panel.appendChild(grid)
  panelContainer.appendChild(panel)

  // Crafting panel (right)
  const craftingPanel = document.createElement('div')
  craftingPanel.style.background = 'rgba(12, 12, 12, 0.96)'
  craftingPanel.style.borderRadius = '8px'
  craftingPanel.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  craftingPanel.style.boxShadow = '0 0 14px rgba(0, 0, 0, 0.95)'
  craftingPanel.style.padding = '1rem 1.25rem'
  craftingPanel.style.minWidth = '200px'
  craftingPanel.style.display = 'flex'
  craftingPanel.style.flexDirection = 'column'
  craftingPanel.style.gap = '1rem'

  // Crafting input slots
  const craftingInputContainer = document.createElement('div')
  const craftingInputLabel = document.createElement('div')
  craftingInputLabel.textContent = 'Crafting Input'
  craftingInputLabel.style.color = 'rgba(255, 255, 255, 0.8)'
  craftingInputLabel.style.fontSize = '0.75rem'
  craftingInputLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  craftingInputLabel.style.marginBottom = '0.5rem'
  craftingInputContainer.appendChild(craftingInputLabel)

  const craftingInputGrid = document.createElement('div')
  craftingInputGrid.style.display = 'grid'
  craftingInputGrid.style.gridTemplateColumns = `repeat(2, min(${slotSize}px, 5vw))`
  craftingInputGrid.style.gap = '0.4rem'

  const craftingSlots: HTMLDivElement[] = []

  for (let i = 0; i < craftingSlotCount; i += 1) {
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

    craftingSlots.push(slot)
    craftingInputGrid.appendChild(slot)
  }

  craftingInputContainer.appendChild(craftingInputGrid)
  craftingPanel.appendChild(craftingInputContainer)

  // Craftable items list
  const craftableContainer = document.createElement('div')
  const craftableLabel = document.createElement('div')
  craftableLabel.textContent = 'Craftable Items'
  craftableLabel.style.color = 'rgba(255, 255, 255, 0.8)'
  craftableLabel.style.fontSize = '0.75rem'
  craftableLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  craftableLabel.style.marginBottom = '0.5rem'
  craftableContainer.appendChild(craftableLabel)

  const craftableList = document.createElement('div')
  craftableList.style.display = 'flex'
  craftableList.style.flexDirection = 'column'
  craftableList.style.gap = '0.3rem'
  craftableList.style.maxHeight = '300px'
  craftableList.style.overflowY = 'auto'
  
  craftableContainer.appendChild(craftableList)
  craftingPanel.appendChild(craftableContainer)

  panelContainer.appendChild(craftingPanel)
  overlay.appendChild(panelContainer)
  parent.appendChild(overlay)

  let open = false

  const applyVisibility = (): void => {
    overlay.style.display = open ? 'flex' : 'none'
  }

  const updateCraftableItemsList = (recipes: ReadonlyArray<any>): void => {
    // Clear existing items
    craftableList.innerHTML = ''

    if (recipes.length === 0) {
      const emptyMsg = document.createElement('div')
      emptyMsg.textContent = 'No recipes available'
      emptyMsg.style.color = 'rgba(255, 255, 255, 0.5)'
      emptyMsg.style.fontSize = '0.7rem'
      emptyMsg.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      emptyMsg.style.fontStyle = 'italic'
      craftableList.appendChild(emptyMsg)
      return
    }

    // Add each craftable item
    recipes.forEach(recipe => {
      const item = recipe.output
      const itemRow = document.createElement('div')
      itemRow.style.display = 'flex'
      itemRow.style.alignItems = 'center'
      itemRow.style.gap = '0.5rem'
      itemRow.style.padding = '0.3rem 0.5rem'
      itemRow.style.background = 'rgba(255, 255, 255, 0.05)'
      itemRow.style.borderRadius = '4px'
      itemRow.style.cursor = 'pointer'
      itemRow.style.transition = 'background 0.15s'

      itemRow.addEventListener('mouseenter', () => {
        itemRow.style.background = 'rgba(255, 255, 255, 0.15)'
      })
      itemRow.addEventListener('mouseleave', () => {
        itemRow.style.background = 'rgba(255, 255, 255, 0.05)'
      })

      if (item.iconUrl) {
        const icon = document.createElement('img')
        icon.src = item.iconUrl
        icon.style.width = '24px'
        icon.style.height = '24px'
        icon.style.objectFit = 'contain'
        icon.style.imageRendering = 'pixelated'
        itemRow.appendChild(icon)
      }

      const name = document.createElement('div')
      name.textContent = item.displayName
      name.style.color = 'rgba(255, 255, 255, 0.9)'
      name.style.fontSize = '0.75rem'
      name.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      itemRow.appendChild(name)

      craftableList.appendChild(itemRow)
    })
  }

  const api: InventoryUI = {
    root: overlay,
    panel,
    slots,
    craftingSlots,
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
    updateCraftingRecipes(craftingInputs: ReadonlyArray<IItem | null>): void {
      const registry = RecipeRegistry.getInstance()
      const matchingRecipes = registry.findMatchingRecipes(craftingInputs)
      updateCraftableItemsList(matchingRecipes)
    },
  }

  applyVisibility()
  return api
}

