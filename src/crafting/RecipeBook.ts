/**
 * Recipe Book - Aggregates recipe data from all crafting systems.
 * Provides unified interface for querying recipes, ingredients, and uses.
 */

import type { IItem } from '../items/Item.ts'
import type { IRecipe, IRecipeIngredient } from './RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../smelting/interfaces/ISmeltingRecipe.ts'
import type { IBrewingRecipe } from '../brewing/interfaces/IBrewingRecipe.ts'
import type { IWoodworkingRecipe } from '../woodworking/interfaces/IWoodworkingRecipe.ts'

import { recipeRegistry } from './RecipeRegistry.ts'
import { smeltingRegistry } from '../smelting/SmeltingRegistry.ts'
import { brewingRegistry } from '../brewing/BrewingRegistry.ts'
import { woodworkingRegistry } from '../woodworking/WoodworkingRegistry.ts'
import { getRegisteredItemIds, createItemFromId } from '../persistence/ItemRegistry.ts'

/**
 * Crafting station types
 */
export type CraftingStation = 'hand' | 'forge' | 'apothecary' | 'woodworking'

/**
 * Display info for crafting stations
 */
export const STATION_INFO: Record<CraftingStation, { label: string; color: string }> = {
  hand: { label: 'Hand Crafting', color: '#8B7355' },
  forge: { label: 'Forge', color: '#FF6B35' },
  apothecary: { label: 'Apothecary', color: '#9B59B6' },
  woodworking: { label: 'Woodworking', color: '#27AE60' },
}

/**
 * Normalized ingredient info
 */
export interface IIngredientInfo {
  /** Item ID (null if tag-based) */
  readonly itemId: string | null
  /** Tag name (null if ID-based) */
  readonly tag: string | null
  /** Required count */
  readonly count: number
}

/**
 * Normalized recipe info
 */
export interface IRecipeInfo {
  /** Original recipe ID */
  readonly recipeId: string
  /** Recipe display name */
  readonly name: string
  /** Crafting station required */
  readonly station: CraftingStation
  /** Ingredients needed */
  readonly ingredients: ReadonlyArray<IIngredientInfo>
  /** Result item ID */
  readonly resultItemId: string
  /** Number of items produced */
  readonly resultCount: number
}

/**
 * Complete recipe data for a single item
 */
export interface IItemRecipeData {
  /** Item ID */
  readonly itemId: string
  /** Display name */
  readonly displayName: string
  /** Icon URL (if available) */
  readonly iconUrl: string | undefined
  /** Recipes that produce this item */
  readonly craftedBy: ReadonlyArray<IRecipeInfo>
  /** Recipes that use this item as an ingredient */
  readonly usedIn: ReadonlyArray<IRecipeInfo>
}

/**
 * Recipe Book - Central service for recipe queries
 */
export class RecipeBook {
  /** All recipe info indexed by recipe ID */
  private readonly recipeIndex: Map<string, IRecipeInfo> = new Map()
  
  /** Item ID -> recipes that produce it */
  private readonly craftedByIndex: Map<string, IRecipeInfo[]> = new Map()
  
  /** Item ID -> recipes that use it as ingredient */
  private readonly usedInIndex: Map<string, IRecipeInfo[]> = new Map()

  /** Tag -> recipes that use the tag as ingredient (e.g. torch takes any 'coal') */
  private readonly usedInByTagIndex: Map<string, IRecipeInfo[]> = new Map()

  /** All item IDs sorted alphabetically by display name */
  private sortedItemIds: string[] = []

  /** Cache of item display names */
  private readonly itemDisplayNames: Map<string, string> = new Map()

  /** Cache of item icon URLs */
  private readonly itemIconUrls: Map<string, string | undefined> = new Map()

  /** Cache of item tags (traits) - drives tag-based usedIn matches and the UI trait chips */
  private readonly itemTags: Map<string, ReadonlyArray<string>> = new Map()

  /**
   * Build the recipe index from all registries.
   * Call this after all registries have been populated.
   */
  buildIndex(): void {
    this.recipeIndex.clear()
    this.craftedByIndex.clear()
    this.usedInIndex.clear()
    this.usedInByTagIndex.clear()
    this.itemDisplayNames.clear()
    this.itemIconUrls.clear()
    this.itemTags.clear()

    // Index hand crafting recipes
    for (const recipe of recipeRegistry.getAllRecipes()) {
      this.indexHandRecipe(recipe)
    }

    // Index smelting recipes
    for (const recipe of smeltingRegistry.getAllRecipes()) {
      this.indexSmeltingRecipe(recipe)
    }

    // Index brewing recipes
    for (const recipe of brewingRegistry.getAllRecipes()) {
      this.indexBrewingRecipe(recipe)
    }

    // Index woodworking recipes
    for (const recipe of woodworkingRegistry.getAllRecipes()) {
      this.indexWoodworkingRecipe(recipe)
    }

    // Build sorted item list and cache item info
    this.buildItemList()

    console.log(`RecipeBook indexed ${this.recipeIndex.size} recipes across ${this.sortedItemIds.length} items`)
  }

  /**
   * Index a hand crafting recipe
   */
  private indexHandRecipe(recipe: IRecipe): void {
    const resultItem = recipe.createResult()
    const info: IRecipeInfo = {
      recipeId: recipe.id,
      name: recipe.name,
      station: 'hand',
      ingredients: recipe.ingredients.map(this.normalizeIngredient),
      resultItemId: resultItem.id,
      resultCount: recipe.resultCount,
    }

    this.addRecipeToIndex(info, recipe.ingredients)
  }

  /**
   * Index a smelting recipe
   */
  private indexSmeltingRecipe(recipe: ISmeltingRecipe): void {
    const resultItem = recipe.createResult()
    const info: IRecipeInfo = {
      recipeId: recipe.id,
      name: recipe.name,
      station: 'forge',
      ingredients: [{ itemId: recipe.inputId ?? null, tag: recipe.inputTag ?? null, count: 1 }],
      resultItemId: resultItem.id,
      resultCount: recipe.resultCount,
    }

    // Index by itemId if specified, or by tag if specified
    if (recipe.inputId) {
      this.addRecipeToIndex(info, [{ itemId: recipe.inputId, count: 1 }])
    } else if (recipe.inputTag) {
      this.addRecipeToIndex(info, [{ tag: recipe.inputTag, count: 1 }])
    }
  }

  /**
   * Index a brewing recipe
   */
  private indexBrewingRecipe(recipe: IBrewingRecipe): void {
    const resultItem = recipe.createResult()
    const info: IRecipeInfo = {
      recipeId: recipe.id,
      name: recipe.name,
      station: 'apothecary',
      ingredients: recipe.ingredients.map((ing) => ({
        itemId: ing.itemId,
        tag: null,
        count: ing.count,
      })),
      resultItemId: resultItem.id,
      resultCount: recipe.resultCount,
    }

    this.addRecipeToIndex(
      info,
      recipe.ingredients.map((ing) => ({ itemId: ing.itemId, count: ing.count })),
    )
  }

  /**
   * Index a woodworking recipe
   */
  private indexWoodworkingRecipe(recipe: IWoodworkingRecipe): void {
    const resultItem = recipe.createResult()
    const info: IRecipeInfo = {
      recipeId: recipe.id,
      name: recipe.name,
      station: 'woodworking',
      ingredients: [{ itemId: recipe.inputItemId, tag: null, count: recipe.inputCount }],
      resultItemId: resultItem.id,
      resultCount: recipe.resultCount,
    }

    this.addRecipeToIndex(info, [{ itemId: recipe.inputItemId, count: recipe.inputCount }])
  }

  /**
   * Normalize an ingredient from IRecipeIngredient format
   */
  private normalizeIngredient(ing: IRecipeIngredient): IIngredientInfo {
    return {
      itemId: ing.itemId ?? null,
      tag: ing.tag ?? null,
      count: ing.count,
    }
  }

  /**
   * Add a recipe to all relevant indexes
   */
  private addRecipeToIndex(
    info: IRecipeInfo,
    ingredients: ReadonlyArray<{ itemId?: string; tag?: string; count: number }>,
  ): void {
    this.recipeIndex.set(info.recipeId, info)

    // Index by result item
    const craftedBy = this.craftedByIndex.get(info.resultItemId) ?? []
    craftedBy.push(info)
    this.craftedByIndex.set(info.resultItemId, craftedBy)

    // Index by ingredient items and by ingredient tags, so items that only
    // satisfy a recipe through a tag (e.g. dried moss matching the torch's
    // 'coal' ingredient) still show up under "Used In"
    for (const ing of ingredients) {
      if (ing.itemId) {
        const usedIn = this.usedInIndex.get(ing.itemId) ?? []
        usedIn.push(info)
        this.usedInIndex.set(ing.itemId, usedIn)
      }
      if (ing.tag) {
        const usedIn = this.usedInByTagIndex.get(ing.tag) ?? []
        usedIn.push(info)
        this.usedInByTagIndex.set(ing.tag, usedIn)
      }
    }
  }

  /**
   * All recipes that use an item as an ingredient, matched by exact item id
   * OR by any of the item's tags, deduplicated by recipe id.
   */
  private collectUsedInRecipes(itemId: string): IRecipeInfo[] {
    const seen = new Set<string>()
    const result: IRecipeInfo[] = []
    const add = (recipes: IRecipeInfo[] | undefined) => {
      for (const recipe of recipes ?? []) {
        if (!seen.has(recipe.recipeId)) {
          seen.add(recipe.recipeId)
          result.push(recipe)
        }
      }
    }
    add(this.usedInIndex.get(itemId))
    for (const tag of this.itemTags.get(itemId) ?? []) {
      add(this.usedInByTagIndex.get(tag))
    }
    return result
  }

  /**
   * Build sorted item list with display name cache
   */
  private buildItemList(): void {
    const itemIds = getRegisteredItemIds()
    const itemsWithNames: Array<{ id: string; displayName: string; iconUrl?: string }> = []

    for (const itemId of itemIds) {
      const item = createItemFromId(itemId)
      if (item) {
        const displayName = item.displayName
        const iconUrl = item.iconUrl
        this.itemDisplayNames.set(itemId, displayName)
        this.itemIconUrls.set(itemId, iconUrl)
        this.itemTags.set(itemId, item.tags ?? [])
        itemsWithNames.push({ id: itemId, displayName, iconUrl })
      }
    }

    // Sort alphabetically by display name
    itemsWithNames.sort((a, b) => a.displayName.localeCompare(b.displayName))
    this.sortedItemIds = itemsWithNames.map((i) => i.id)
  }

  /**
   * Get all item IDs sorted alphabetically
   */
  getAllItemIds(): ReadonlyArray<string> {
    return this.sortedItemIds
  }

  /**
   * Search items by name (case-insensitive partial match)
   */
  searchItems(query: string): ReadonlyArray<string> {
    if (!query.trim()) {
      return this.sortedItemIds
    }

    const lowerQuery = query.toLowerCase()
    return this.sortedItemIds.filter((itemId) => {
      const displayName = this.itemDisplayNames.get(itemId) ?? itemId
      return displayName.toLowerCase().includes(lowerQuery)
    })
  }

  /**
   * Get display name for an item
   */
  getItemDisplayName(itemId: string): string {
    return this.itemDisplayNames.get(itemId) ?? itemId
  }

  /**
   * Get icon URL for an item
   */
  getItemIconUrl(itemId: string): string | undefined {
    return this.itemIconUrls.get(itemId)
  }

  /**
   * Get complete recipe data for an item
   */
  getItemRecipeData(itemId: string): IItemRecipeData {
    return {
      itemId,
      displayName: this.getItemDisplayName(itemId),
      iconUrl: this.getItemIconUrl(itemId),
      craftedBy: this.craftedByIndex.get(itemId) ?? [],
      usedIn: this.collectUsedInRecipes(itemId),
    }
  }

  /**
   * Get the tags (traits) of an item, e.g. ['coal', 'fuel'] for dried moss.
   */
  getItemTags(itemId: string): ReadonlyArray<string> {
    return this.itemTags.get(itemId) ?? []
  }

  /**
   * Get recipes that produce a specific item
   */
  getRecipesFor(itemId: string): ReadonlyArray<IRecipeInfo> {
    return this.craftedByIndex.get(itemId) ?? []
  }

  /**
   * Get recipes that use an item as ingredient
   */
  getRecipesUsing(itemId: string): ReadonlyArray<IRecipeInfo> {
    return this.collectUsedInRecipes(itemId)
  }

  /**
   * Check if an item has any recipes (either crafted by or used in)
   */
  hasRecipes(itemId: string): boolean {
    return (this.craftedByIndex.get(itemId)?.length ?? 0) > 0 || this.collectUsedInRecipes(itemId).length > 0
  }

  /**
   * Get a recipe by ID
   */
  getRecipe(recipeId: string): IRecipeInfo | undefined {
    return this.recipeIndex.get(recipeId)
  }
}

// Singleton instance
export const recipeBook = new RecipeBook()
