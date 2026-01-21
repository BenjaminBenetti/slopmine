import type { IBrewingRecipe, IBrewingIngredient } from './interfaces/IBrewingRecipe.ts'

/**
 * Registry for all brewing recipes.
 * Singleton pattern for global access.
 */
export class BrewingRegistry {
  private static instance: BrewingRegistry | null = null
  private readonly recipes: Map<string, IBrewingRecipe> = new Map()

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): BrewingRegistry {
    if (!BrewingRegistry.instance) {
      BrewingRegistry.instance = new BrewingRegistry()
    }
    return BrewingRegistry.instance
  }

  /**
   * Reset the singleton (for testing).
   */
  static resetInstance(): void {
    BrewingRegistry.instance = null
  }

  /**
   * Register a brewing recipe.
   */
  register(recipe: IBrewingRecipe): void {
    if (this.recipes.has(recipe.id)) {
      console.warn(`Brewing recipe ${recipe.id} is already registered, overwriting.`)
    }
    this.recipes.set(recipe.id, recipe)
  }

  /**
   * Get a recipe by its ID.
   */
  getRecipe(id: string): IBrewingRecipe | undefined {
    return this.recipes.get(id)
  }

  /**
   * Find a recipe that matches the given ingredient item IDs.
   * Matching is order-independent: [herb, mushroom] matches [mushroom, herb].
   *
   * @param ingredientIds Array of item IDs (include duplicates for multiple of same item)
   * @returns The matching recipe, or null if no recipe matches
   */
  findRecipe(ingredientIds: string[]): IBrewingRecipe | null {
    const sortedInput = this.normalizeIngredients(ingredientIds)

    for (const recipe of this.recipes.values()) {
      const sortedRecipe = this.normalizeRecipeIngredients(recipe.ingredients)
      if (this.ingredientsMatch(sortedInput, sortedRecipe)) {
        return recipe
      }
    }

    return null
  }

  /**
   * Check if a set of ingredients can produce any recipe.
   */
  canBrew(ingredientIds: string[]): boolean {
    return this.findRecipe(ingredientIds) !== null
  }

  /**
   * Get all registered recipes.
   */
  getAllRecipes(): IBrewingRecipe[] {
    return Array.from(this.recipes.values())
  }

  /**
   * Normalize an array of ingredient IDs by sorting them.
   * This allows order-independent matching.
   */
  private normalizeIngredients(ingredientIds: string[]): string[] {
    return [...ingredientIds].sort()
  }

  /**
   * Convert recipe ingredients to a sorted array of item IDs.
   * Expands count > 1 into multiple entries.
   */
  private normalizeRecipeIngredients(ingredients: ReadonlyArray<IBrewingIngredient>): string[] {
    const expanded: string[] = []
    for (const ingredient of ingredients) {
      for (let i = 0; i < ingredient.count; i++) {
        expanded.push(ingredient.itemId)
      }
    }
    return expanded.sort()
  }

  /**
   * Check if two sorted ingredient arrays match exactly.
   */
  private ingredientsMatch(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  }
}

/** Convenience reference to the singleton instance */
export const brewingRegistry = BrewingRegistry.getInstance()
