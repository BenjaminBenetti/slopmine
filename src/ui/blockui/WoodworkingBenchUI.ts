import type { IBlockUI } from './interfaces/IBlockUI.ts'
import type { IItemStack, IPlayerState } from '../../player/PlayerState.ts'
import type { WoodworkingBenchState } from '../../world/blocks/types/woodworking_bench/WoodworkingBenchState.ts'
import type { IWoodworkingRecipe } from '../../woodworking/interfaces/IWoodworkingRecipe.ts'
import { syncSlotsFromState } from '../SlotRenderer.ts'
import type { CraftBatch } from '../CraftingPanel.ts'

/**
 * Woodworking bench UI - deliberately mirrors the hand-crafting panel:
 * a small ingredient grid on top and a clickable "Craftable" recipe list
 * below. Clicking a recipe consumes ingredients from the bench slots and
 * puts the result straight into the player inventory. Leftover ingredients
 * are returned to the player when the UI closes.
 */
export function createWoodworkingBenchUI(
  state: WoodworkingBenchState,
  playerState: IPlayerState
): IBlockUI {
  const slotSize = 44

  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.gap = '1rem'
  root.style.padding = '1rem'
  root.style.background = 'rgba(12, 12, 12, 0.96)'
  root.style.borderRadius = '8px'
  root.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  root.style.minWidth = '180px'

  const title = document.createElement('div')
  title.textContent = 'Woodworking Bench'
  title.style.color = 'rgba(255, 255, 255, 0.9)'
  title.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  title.style.fontSize = '0.85rem'
  title.style.fontWeight = 'bold'
  title.style.marginBottom = '0.25rem'
  root.appendChild(title)

  // Ingredient grid (3x1)
  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = `repeat(3, ${slotSize}px)`
  grid.style.gap = '0.4rem'

  const slots: HTMLDivElement[] = []
  for (let i = 0; i < state.getSlotCount(); i++) {
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
    slots.push(slot)
    grid.appendChild(slot)
  }
  root.appendChild(grid)

  const divider = document.createElement('div')
  divider.style.height = '1px'
  divider.style.background = 'rgba(255, 255, 255, 0.2)'
  divider.style.margin = '0.5rem 0'
  root.appendChild(divider)

  const craftableLabel = document.createElement('div')
  craftableLabel.textContent = 'Craftable'
  craftableLabel.style.color = 'rgba(255, 255, 255, 0.9)'
  craftableLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  craftableLabel.style.fontSize = '0.85rem'
  craftableLabel.style.fontWeight = 'bold'
  craftableLabel.style.marginBottom = '0.25rem'
  root.appendChild(craftableLabel)

  const craftableList = document.createElement('div')
  craftableList.style.display = 'flex'
  craftableList.style.flexDirection = 'column'
  craftableList.style.gap = '0.3rem'
  craftableList.style.maxHeight = '200px'
  craftableList.style.overflowY = 'auto'
  craftableList.style.minHeight = '60px'
  root.appendChild(craftableList)

  let isOpen = false
  let itemsReturned = false
  // Signature of the last rendered state, so the per-frame sync only
  // rebuilds the recipe list when slot contents actually change
  let lastSignature = ''

  // Same batch semantics as the hand-crafting panel:
  // plain click = 1, shift+click = 10, ctrl+click = all ('all' capped as a backstop)
  const craft = (recipe: IWoodworkingRecipe, batch: CraftBatch): void => {
    const cap = batch === 'one' ? 1 : batch === 'ten' ? 10 : 1000

    let crafted = 0
    while (crafted < cap) {
      if (!state.craft(recipe)) break // ingredients exhausted

      const leftover = playerState.addItemCounted(recipe.createResult(), recipe.resultCount)
      crafted++
      if (leftover > 0) break // inventory full - stop batching
    }

    if (crafted > 0) refresh()
  }

  const updateCraftableList = (recipes: IWoodworkingRecipe[]): void => {
    craftableList.innerHTML = ''

    if (recipes.length === 0) {
      const emptyMsg = document.createElement('div')
      emptyMsg.textContent = 'Add wood to see recipes'
      emptyMsg.style.color = 'rgba(255, 255, 255, 0.4)'
      emptyMsg.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      emptyMsg.style.fontSize = '0.75rem'
      emptyMsg.style.fontStyle = 'italic'
      craftableList.appendChild(emptyMsg)
      return
    }

    for (const recipe of recipes) {
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '0.5rem'
      row.style.padding = '0.4rem 0.5rem'
      row.style.background = 'rgba(40, 40, 40, 0.8)'
      row.style.borderRadius = '4px'
      row.style.cursor = 'pointer'
      row.style.transition = 'background 0.15s'
      row.title = 'Click: craft 1  •  Shift+click: craft 10  •  Ctrl+click: craft all'
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(60, 60, 60, 0.9)'
      })
      row.addEventListener('mouseleave', () => {
        row.style.background = 'rgba(40, 40, 40, 0.8)'
      })

      const resultItem = recipe.createResult()
      if (resultItem.iconUrl) {
        const icon = document.createElement('img')
        icon.src = resultItem.iconUrl
        icon.style.width = '24px'
        icon.style.height = '24px'
        icon.style.objectFit = 'contain'
        icon.style.imageRendering = 'pixelated'
        icon.draggable = false
        row.appendChild(icon)
      }

      const name = document.createElement('span')
      name.textContent =
        recipe.resultCount > 1 ? `${recipe.name} ×${recipe.resultCount}` : recipe.name
      name.style.color = 'rgba(255, 255, 255, 0.9)'
      name.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      name.style.fontSize = '0.8rem'
      row.appendChild(name)

      row.addEventListener('click', (event) => {
        const batch: CraftBatch = event.ctrlKey ? 'all' : event.shiftKey ? 'ten' : 'one'
        craft(recipe, batch)
      })
      craftableList.appendChild(row)
    }
  }

  const stateSlots = (): (IItemStack | null)[] => {
    const arr: (IItemStack | null)[] = []
    for (let i = 0; i < state.getSlotCount(); i++) {
      arr.push(state.getStack(i))
    }
    return arr
  }

  const refresh = (): void => {
    const current = stateSlots()
    syncSlotsFromState(slots, current)
    const signature = current
      .map((s) => (s ? `${s.item.id}:${s.count}` : '-'))
      .join('|')
    if (signature !== lastSignature) {
      lastSignature = signature
      updateCraftableList(state.getCraftableRecipes())
    }
  }

  const returnItemsToPlayer = (): void => {
    if (itemsReturned) return
    itemsReturned = true
    for (let i = 0; i < state.getSlotCount(); i++) {
      const stack = state.getStack(i)
      if (stack) {
        playerState.addItem(stack.item, stack.count)
        state.setStack(i, null)
      }
    }
  }

  const api: IBlockUI = {
    root,
    slots,

    open(): void {
      isOpen = true
      itemsReturned = false
      lastSignature = ''
      refresh()
    },

    close(): void {
      isOpen = false
      // Like the hand-crafting grid: leftover ingredients go back to the player
      returnItemsToPlayer()
    },

    syncFromState(): void {
      if (!isOpen) return
      refresh()
    },

    destroy(): void {
      returnItemsToPlayer()
      if (root.parentElement) {
        root.parentElement.removeChild(root)
      }
    },

    getStack(index: number): IItemStack | null {
      return state.getStack(index)
    },

    setStack(index: number, stack: IItemStack | null): void {
      state.setStack(index, stack)
    },
  }

  updateCraftableList([])
  return api
}
