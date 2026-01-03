import type { IRecipe } from './IRecipe.ts'
import type { IItem } from './Item.ts'

/**
 * Central registry for all crafting recipes.
 * Items can register their recipes here for lookup during crafting.
 */
export class RecipeRegistry {
  private static instance: RecipeRegistry | null = null
  private recipes: IRecipe[] = []

  private constructor() {}

  static getInstance(): RecipeRegistry {
    if (!RecipeRegistry.instance) {
      RecipeRegistry.instance = new RecipeRegistry()
    }
    return RecipeRegistry.instance
  }

  /**
   * Register a recipe in the registry.
   */
  register(recipe: IRecipe): void {
    this.recipes.push(recipe)
  }

  /**
   * Get all registered recipes.
   */
  getAllRecipes(): ReadonlyArray<IRecipe> {
    return this.recipes
  }

  /**
   * Find recipes that can be crafted with the given items.
   * @param items - List of items available in crafting slots (nulls for empty slots)
   * @returns Array of matching recipes
   */
  findMatchingRecipes(items: ReadonlyArray<IItem | null>): IRecipe[] {
    return this.recipes.filter(recipe => {
      // Filter out null items from input
      const nonNullItems = items.filter((item): item is IItem => item !== null)
      
      // Must have at least as many items as recipe requires
      if (nonNullItems.length < recipe.ingredients.length) {
        return false
      }

      // Check if we can match all ingredients
      const usedIndices = new Set<number>()
      
      for (const ingredientOptions of recipe.ingredients) {
        let foundMatch = false
        
        for (let i = 0; i < nonNullItems.length; i++) {
          if (usedIndices.has(i)) continue
          
          const item = nonNullItems[i]
          // Check if this item matches any of the ingredient options
          if (ingredientOptions.some(option => option.id === item.id)) {
            usedIndices.add(i)
            foundMatch = true
            break
          }
        }
        
        if (!foundMatch) {
          return false
        }
      }
      
      return true
    })
  }

  /**
   * Clear all recipes (mainly for testing).
   */
  clear(): void {
    this.recipes = []
  }
}
