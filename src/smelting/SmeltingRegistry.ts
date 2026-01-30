import type { ISmeltingRecipe } from './interfaces/ISmeltingRecipe.ts'
import type { IItem } from '../items/Item.ts'

/**
 * Registry for all smelting recipes.
 * Singleton pattern for global access.
 */
export class SmeltingRegistry {
  private static instance: SmeltingRegistry | null = null
  private readonly recipes: Map<string, ISmeltingRecipe> = new Map()
  private readonly recipesByInput: Map<string, ISmeltingRecipe> = new Map()
  private readonly recipesByTag: Map<string, ISmeltingRecipe> = new Map()

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): SmeltingRegistry {
    if (!SmeltingRegistry.instance) {
      SmeltingRegistry.instance = new SmeltingRegistry()
    }
    return SmeltingRegistry.instance
  }

  /**
   * Reset the singleton (for testing).
   */
  static resetInstance(): void {
    SmeltingRegistry.instance = null
  }

  /**
   * Register a smelting recipe.
   */
  register(recipe: ISmeltingRecipe): void {
    if (this.recipes.has(recipe.id)) {
      console.warn(`Smelting recipe ${recipe.id} is already registered, overwriting.`)
    }
    this.recipes.set(recipe.id, recipe)

    // Register by inputId if specified
    if (recipe.inputId) {
      this.recipesByInput.set(recipe.inputId, recipe)
    }

    // Register by inputTag if specified
    if (recipe.inputTag) {
      this.recipesByTag.set(recipe.inputTag, recipe)
    }
  }

  /**
   * Get a recipe by its ID.
   */
  getRecipe(id: string): ISmeltingRecipe | undefined {
    return this.recipes.get(id)
  }

  /**
   * Get a recipe that can smelt a given input item by ID.
   * @deprecated Use getRecipeForItem() for tag support
   */
  getRecipeForInput(inputId: string): ISmeltingRecipe | undefined {
    return this.recipesByInput.get(inputId)
  }

  /**
   * Get a recipe that can smelt a given item.
   * Checks both exact item ID and item tags.
   */
  getRecipeForItem(item: IItem): ISmeltingRecipe | undefined {
    // First check by exact item ID
    const byId = this.recipesByInput.get(item.id)
    if (byId) return byId

    // Then check by item tags
    const tags = item.tags ?? []
    for (const tag of tags) {
      const byTag = this.recipesByTag.get(tag)
      if (byTag) return byTag
    }

    return undefined
  }

  /**
   * Check if an item can be smelted by ID.
   * @deprecated Use canSmeltItem() for tag support
   */
  canSmelt(inputId: string): boolean {
    return this.recipesByInput.has(inputId)
  }

  /**
   * Check if an item can be smelted (supports tags).
   */
  canSmeltItem(item: IItem): boolean {
    return this.getRecipeForItem(item) !== undefined
  }

  /**
   * Get all registered recipes.
   */
  getAllRecipes(): ISmeltingRecipe[] {
    return Array.from(this.recipes.values())
  }
}

/** Convenience reference to the singleton instance */
export const smeltingRegistry = SmeltingRegistry.getInstance()
