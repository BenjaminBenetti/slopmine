import type { IBlockUI } from '../ui/blockui/interfaces/IBlockUI.ts'
import type { IItemStack, IPlayerState } from '../player/PlayerState.ts'
import type { IItem } from '../items/Item.ts'
import type { IRecipe, IRecipeIngredient } from '../crafting/RecipeRegistry.ts'
import type { HellforgeState } from '../world/blocks/types/hellforge/HellforgeState.ts'
import { createItemFromId, isItemRegistered } from '../persistence/ItemRegistry.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { hellforgeRegistry } from './HellforgeRegistry.ts'

export interface HellforgeUIDeps {
  readonly playerState: IPlayerState
  /** The inventory changed (ingredients taken, result added) */
  readonly onInventoryChanged?: () => void
  /** Result items that did not fit the inventory (dropped into the world) */
  readonly dropOverflow?: (item: IItem, count: number) => void
}

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
const EMBER = '#ff8a3d'

/** One inventory container (toolbar or grid) seen as a list of slots. */
interface SlotContainer {
  readonly slots: ReadonlyArray<IItemStack | null>
  setStack(index: number, stack: IItemStack | null): void
}

interface DisplayInfo {
  readonly name: string
  readonly iconUrl: string | undefined
}

/** Display name/icon for an ingredient (cached; ids from other streams may be missing). */
const displayCache = new Map<string, DisplayInfo>()

function prettify(id: string): string {
  return id
    .replace(/_block$/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function ingredientDisplay(ingredient: IRecipeIngredient): DisplayInfo {
  const key = ingredient.itemId ? `id:${ingredient.itemId}` : `tag:${ingredient.tag ?? ''}`
  let info = displayCache.get(key)
  if (!info) {
    if (ingredient.itemId) {
      const item = isItemRegistered(ingredient.itemId) ? createItemFromId(ingredient.itemId) : null
      info = item
        ? { name: item.displayName, iconUrl: item.iconUrl }
        : { name: prettify(ingredient.itemId), iconUrl: undefined }
    } else {
      info = { name: `Any ${ingredient.tag ?? 'item'}`, iconUrl: undefined }
    }
    displayCache.set(key, info)
  }
  return info
}

function matches(item: IItem, ingredient: IRecipeIngredient): boolean {
  if (ingredient.itemId) return item.id === ingredient.itemId
  if (ingredient.tag) return item.tags?.includes(ingredient.tag) ?? false
  return false
}

/**
 * Hellforge UI: lists every Hellforge recipe with the ingredients it needs
 * and how many the player carries (green = enough). Clicking a craftable
 * recipe takes the ingredients straight from the inventory (main grid
 * first, then the hotbar) and puts the result in the inventory - no slots to
 * fill, since every recipe is a reforge of gear the player already owns plus
 * rare Hell materials. Craftable recipes are listed first.
 */
export function createHellforgeUI(_state: HellforgeState, deps: HellforgeUIDeps): IBlockUI {
  const { playerState } = deps
  // Main grid first so the hotbar keeps its items as long as possible
  const containers: SlotContainer[] = [playerState.inventory.inventory, playerState.inventory.toolbar]

  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.gap = '0.5rem'
  root.style.padding = '1rem'
  root.style.background = 'linear-gradient(180deg, rgba(36, 10, 8, 0.97), rgba(14, 8, 10, 0.97))'
  root.style.borderRadius = '8px'
  root.style.border = '2px solid rgba(255, 110, 40, 0.45)'
  root.style.boxShadow = '0 0 18px rgba(255, 80, 20, 0.25)'
  root.style.width = '340px'
  root.style.fontFamily = FONT

  const title = document.createElement('div')
  title.textContent = 'Hellforge'
  title.style.color = EMBER
  title.style.fontSize = '0.95rem'
  title.style.fontWeight = 'bold'
  title.style.letterSpacing = '0.04em'
  root.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = 'Forges from your inventory. Click a lit recipe to craft.'
  hint.style.color = 'rgba(255, 255, 255, 0.5)'
  hint.style.fontSize = '0.7rem'
  root.appendChild(hint)

  const divider = document.createElement('div')
  divider.style.height = '1px'
  divider.style.background = 'rgba(255, 120, 60, 0.3)'
  divider.style.margin = '0.25rem 0'
  root.appendChild(divider)

  const list = document.createElement('div')
  list.style.display = 'flex'
  list.style.flexDirection = 'column'
  list.style.gap = '0.35rem'
  list.style.maxHeight = '300px'
  list.style.overflowY = 'auto'
  list.style.paddingRight = '2px'
  root.appendChild(list)

  let isOpen = false
  let lastSignature = ''

  /** Count how many of `ingredient` the player carries. */
  const countAvailable = (ingredient: IRecipeIngredient): number => {
    let total = 0
    for (const container of containers) {
      for (const stack of container.slots) {
        if (stack && stack.count > 0 && matches(stack.item, ingredient)) total += stack.count
      }
    }
    return total
  }

  /**
   * Whether every ingredient is carried. Ingredients that could match the
   * same items (an id and a tag) are counted against each other.
   */
  const canCraft = (recipe: IRecipe): boolean => {
    for (const ingredient of recipe.ingredients) {
      let needed = 0
      for (const other of recipe.ingredients) {
        if (other === ingredient || sameKey(other, ingredient)) needed += other.count
      }
      if (countAvailable(ingredient) < needed) return false
    }
    return true
  }

  const take = (ingredient: IRecipeIngredient): void => {
    let remaining = ingredient.count
    for (const container of containers) {
      for (let i = 0; i < container.slots.length && remaining > 0; i++) {
        const stack = container.slots[i]
        if (!stack || stack.count <= 0 || !matches(stack.item, ingredient)) continue
        const used = Math.min(stack.count, remaining)
        stack.count -= used
        remaining -= used
        if (stack.count <= 0) container.setStack(i, null)
      }
    }
  }

  const craft = (recipe: IRecipe): void => {
    if (!canCraft(recipe)) return
    for (const ingredient of recipe.ingredients) take(ingredient)

    const product = recipe.createResult()
    const leftover = playerState.addItemCounted(product, recipe.resultCount)
    if (leftover > 0) deps.dropOverflow?.(product, leftover)
    gameEvents.emit({ type: 'item-crafted', itemId: product.id, count: recipe.resultCount, station: 'hellforge' })

    deps.onInventoryChanged?.()
    lastSignature = ''
    refresh()
  }

  const buildRow = (recipe: IRecipe, craftable: boolean): HTMLDivElement => {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '0.6rem'
    row.style.padding = '0.45rem 0.55rem'
    row.style.borderRadius = '5px'
    row.style.transition = 'background 0.15s'
    const idleBackground = craftable ? 'rgba(96, 34, 14, 0.85)' : 'rgba(34, 30, 32, 0.75)'
    row.style.background = idleBackground
    row.style.border = craftable ? '1px solid rgba(255, 130, 50, 0.65)' : '1px solid rgba(255, 255, 255, 0.08)'
    row.style.cursor = craftable ? 'pointer' : 'default'
    row.dataset.recipeId = recipe.id
    row.dataset.craftable = craftable ? 'true' : 'false'

    const result = recipe.createResult()
    const icon = document.createElement('img')
    icon.style.width = '30px'
    icon.style.height = '30px'
    icon.style.objectFit = 'contain'
    icon.style.imageRendering = 'pixelated'
    icon.style.flexShrink = '0'
    icon.style.opacity = craftable ? '1' : '0.55'
    icon.draggable = false
    if (result.iconUrl) icon.src = result.iconUrl
    row.appendChild(icon)

    const body = document.createElement('div')
    body.style.display = 'flex'
    body.style.flexDirection = 'column'
    body.style.gap = '0.2rem'
    body.style.minWidth = '0'

    const name = document.createElement('div')
    name.textContent = recipe.resultCount > 1 ? `${recipe.name} ×${recipe.resultCount}` : recipe.name
    name.style.color = craftable ? '#ffd2a8' : 'rgba(255, 255, 255, 0.6)'
    name.style.fontSize = '0.8rem'
    name.style.fontWeight = 'bold'
    body.appendChild(name)

    const chips = document.createElement('div')
    chips.style.display = 'flex'
    chips.style.flexWrap = 'wrap'
    chips.style.gap = '0.25rem 0.5rem'
    for (const ingredient of recipe.ingredients) {
      const display = ingredientDisplay(ingredient)
      const have = countAvailable(ingredient)
      const enough = have >= ingredient.count

      const chip = document.createElement('div')
      chip.style.display = 'flex'
      chip.style.alignItems = 'center'
      chip.style.gap = '0.2rem'
      chip.title = display.name
      if (display.iconUrl) {
        const chipIcon = document.createElement('img')
        chipIcon.src = display.iconUrl
        chipIcon.style.width = '16px'
        chipIcon.style.height = '16px'
        chipIcon.style.objectFit = 'contain'
        chipIcon.style.imageRendering = 'pixelated'
        chipIcon.draggable = false
        chip.appendChild(chipIcon)
      } else {
        const label = document.createElement('span')
        label.textContent = display.name
        label.style.color = 'rgba(255, 255, 255, 0.7)'
        label.style.fontSize = '0.68rem'
        chip.appendChild(label)
      }
      const count = document.createElement('span')
      count.textContent = `${Math.min(have, 999)}/${ingredient.count}`
      count.style.color = enough ? '#9be39b' : '#ff8577'
      count.style.fontSize = '0.68rem'
      count.style.fontVariantNumeric = 'tabular-nums'
      chip.appendChild(count)
      chips.appendChild(chip)
    }
    body.appendChild(chips)
    row.appendChild(body)

    if (craftable) {
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(140, 52, 18, 0.95)'
      })
      row.addEventListener('mouseleave', () => {
        row.style.background = idleBackground
      })
      row.addEventListener('click', () => craft(recipe))
    }
    return row
  }

  /** Inventory signature: rebuild the list only when the carried items change. */
  const inventorySignature = (): string => {
    let signature = ''
    for (const container of containers) {
      for (const stack of container.slots) {
        signature += stack ? `${stack.item.id}:${stack.count}|` : '-|'
      }
    }
    return signature
  }

  const refresh = (): void => {
    const signature = inventorySignature()
    if (signature === lastSignature) return
    lastSignature = signature

    const recipes = hellforgeRegistry.getAllRecipes()
    const craftable = recipes.filter(canCraft)
    const locked = recipes.filter((recipe) => !craftable.includes(recipe))

    list.replaceChildren()
    if (recipes.length === 0) {
      const empty = document.createElement('div')
      empty.textContent = 'The forge is cold - no recipes known.'
      empty.style.color = 'rgba(255, 255, 255, 0.4)'
      empty.style.fontSize = '0.75rem'
      empty.style.fontStyle = 'italic'
      list.appendChild(empty)
      return
    }
    for (const recipe of craftable) list.appendChild(buildRow(recipe, true))
    for (const recipe of locked) list.appendChild(buildRow(recipe, false))
  }

  return {
    root,
    slots: [],

    open(): void {
      isOpen = true
      lastSignature = ''
      refresh()
    },

    close(): void {
      isOpen = false
    },

    syncFromState(): void {
      if (isOpen) refresh()
    },

    destroy(): void {
      if (root.parentElement) root.parentElement.removeChild(root)
    },

    getStack(): IItemStack | null {
      return null
    },

    setStack(): void {
      // No slots
    },

    acceptsQuickTransfer(): boolean {
      return false
    },
  }
}

function sameKey(a: IRecipeIngredient, b: IRecipeIngredient): boolean {
  return (a.itemId !== undefined && a.itemId === b.itemId) || (a.tag !== undefined && a.tag === b.tag)
}
