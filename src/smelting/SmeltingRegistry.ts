import type { ISmeltingRecipe } from './interfaces/ISmeltingRecipe.ts'

/**
 * Registry for all smelting recipes.
 * Singleton pattern for global access.
 */
export class SmeltingRegistry {
  private static instance: SmeltingRegistry | null = null
  private readonly recipes: Map<string, ISmeltingRecipe> = new Map()
  private readonly recipesByInput: Map<string, ISmeltingRecipe> = new Map()

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
    this.recipesByInput.set(recipe.inputId, recipe)
  }

  /**
   * Get a recipe by its ID.
   */
  getRecipe(id: string): ISmeltingRecipe | undefined {
    return this.recipes.get(id)
  }

  /**
   * Get a recipe that can smelt a given input item.
   */
  getRecipeForInput(inputId: string): ISmeltingRecipe | undefined {
    return this.recipesByInput.get(inputId)
  }

  /**
   * Check if an item can be smelted.
   */
  canSmelt(inputId: string): boolean {
    return this.recipesByInput.has(inputId)
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
