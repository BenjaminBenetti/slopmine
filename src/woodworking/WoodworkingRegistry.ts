import type { IWoodworkingRecipe } from './interfaces/IWoodworkingRecipe.ts'

/**
 * Registry for woodworking recipes.
 * Manages all available recipes for the woodworking bench.
 */
class WoodworkingRegistry {
  private readonly recipes: Map<string, IWoodworkingRecipe> = new Map()
  private readonly recipesByInput: Map<string, IWoodworkingRecipe[]> = new Map()

  /**
   * Register a new woodworking recipe.
   */
  register(recipe: IWoodworkingRecipe): void {
    this.recipes.set(recipe.id, recipe)

    // Index by input item
    const existing = this.recipesByInput.get(recipe.inputItemId) || []
    existing.push(recipe)
    this.recipesByInput.set(recipe.inputItemId, existing)
  }

  /**
   * Get a recipe by ID.
   */
  getRecipe(id: string): IWoodworkingRecipe | undefined {
    return this.recipes.get(id)
  }

  /**
   * Get all recipes that can be made with a given input item.
   */
  getRecipesForInput(inputItemId: string): IWoodworkingRecipe[] {
    return this.recipesByInput.get(inputItemId) || []
  }

  /**
   * Get all recipes craftable from aggregated ingredient counts
   * (shapeless matching across the bench's input slots).
   */
  findCraftableRecipes(countsById: Readonly<Record<string, number>>): IWoodworkingRecipe[] {
    const craftable: IWoodworkingRecipe[] = []
    for (const [itemId, count] of Object.entries(countsById)) {
      for (const recipe of this.recipesByInput.get(itemId) ?? []) {
        if (count >= recipe.inputCount) {
          craftable.push(recipe)
        }
      }
    }
    return craftable
  }

  /**
   * Get all registered recipes.
   */
  getAllRecipes(): IWoodworkingRecipe[] {
    return Array.from(this.recipes.values())
  }

  /**
   * Check if any recipe exists for a given input item.
   */
  hasRecipeForInput(inputItemId: string): boolean {
    return this.recipesByInput.has(inputItemId)
  }
}

// Singleton instance
export const woodworkingRegistry = new WoodworkingRegistry()
