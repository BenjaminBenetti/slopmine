import type { IItemStack } from '../player/PlayerState.ts'
import type { IIngredientCounts, IRecipe } from './RecipeRegistry.ts'
import { recipeRegistry } from './RecipeRegistry.ts'

export interface ICraftingState {
  readonly width: number
  readonly height: number
  readonly slots: ReadonlyArray<IItemStack | null>

  getStack(index: number): IItemStack | null
  setStack(index: number, stack: IItemStack | null): void
  clearSlot(index: number): void

  /** Get aggregated ingredient counts for recipe matching */
  getIngredientCounts(): IIngredientCounts

  /** Get all recipes that can be crafted with current ingredients */
  getCraftableRecipes(): IRecipe[]

  /**
   * Attempt to craft a recipe.
   * Returns the result item stack if successful, null if ingredients insufficient.
   */
  craft(recipe: IRecipe): IItemStack | null

  /** Clear all crafting slots */
  clearAll(): void
}

/**
 * Manages the 3x2 crafting slot grid.
 * Tracks ingredients and determines craftable recipes.
 */
export class CraftingState implements ICraftingState {
  readonly width = 3
  readonly height = 2
  private readonly slotsInternal: (IItemStack | null)[]

  /** Cached ingredient counts, invalidated on slot change */
  private cachedIngredients: IIngredientCounts | null = null
  /** Cached craftable recipes, invalidated on slot change */
  private cachedCraftable: IRecipe[] | null = null

  constructor() {
    this.slotsInternal = new Array<IItemStack | null>(this.width * this.height).fill(null)
  }

  get slots(): ReadonlyArray<IItemStack | null> {
    return this.slotsInternal
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.slotsInternal.length) {
      throw new Error(`Crafting slot index out of range: ${index}`)
    }
  }

  private invalidateCache(): void {
    this.cachedIngredients = null
    this.cachedCraftable = null
  }

  getStack(index: number): IItemStack | null {
    this.assertIndex(index)
    return this.slotsInternal[index]
  }

  setStack(index: number, stack: IItemStack | null): void {
    this.assertIndex(index)
    this.slotsInternal[index] = stack
    this.invalidateCache()
  }

  clearSlot(index: number): void {
    this.setStack(index, null)
  }

  clearAll(): void {
    for (let i = 0; i < this.slotsInternal.length; i++) {
      this.slotsInternal[i] = null
    }
    this.invalidateCache()
  }

  getIngredientCounts(): IIngredientCounts {
    if (this.cachedIngredients) {
      return this.cachedIngredients
    }

    const byId = new Map<string, number>()
    const byTag = new Map<string, number>()

    for (const stack of this.slotsInternal) {
      if (!stack) continue

      const item = stack.item
      const count = stack.count

      // Count by ID
      byId.set(item.id, (byId.get(item.id) ?? 0) + count)

      // Count by tags
      if (item.tags) {
        for (const tag of item.tags) {
          byTag.set(tag, (byTag.get(tag) ?? 0) + count)
        }
      }
    }

    this.cachedIngredients = { byId, byTag }
    return this.cachedIngredients
  }

  getCraftableRecipes(): IRecipe[] {
    if (this.cachedCraftable) {
      return this.cachedCraftable
    }

    const ingredients = this.getIngredientCounts()
    this.cachedCraftable = recipeRegistry.findCraftableRecipes(ingredients)
    return this.cachedCraftable
  }

  craft(recipe: IRecipe): IItemStack | null {
    const ingredients = this.getIngredientCounts()

    if (!recipeRegistry.canCraft(recipe, ingredients)) {
      return null
    }

    // Consume ingredients from slots
    this.consumeIngredients(recipe)

    // Create result
    const resultItem = recipe.createResult()
    return { item: resultItem, count: recipe.resultCount }
  }

  private consumeIngredients(recipe: IRecipe): void {
    for (const ingredient of recipe.ingredients) {
      let remaining = ingredient.count

      for (let i = 0; i < this.slotsInternal.length && remaining > 0; i++) {
        const stack = this.slotsInternal[i]
        if (!stack) continue

        const matches = ingredient.itemId
          ? stack.item.id === ingredient.itemId
          : ingredient.tag && stack.item.tags?.includes(ingredient.tag)

        if (matches) {
          const toConsume = Math.min(remaining, stack.count)
          stack.count -= toConsume
          remaining -= toConsume

          if (stack.count <= 0) {
            this.slotsInternal[i] = null
          }
        }
      }
    }

    this.invalidateCache()
  }
}
