import type { IItem } from '../items/Item.ts'

/**
 * A single ingredient in a recipe.
 * Can match by item ID or by tag.
 */
export interface IRecipeIngredient {
  /** Item ID to match (exact match) */
  readonly itemId?: string
  /** Tag to match (any item with this tag) */
  readonly tag?: string
  /** Required count of this ingredient */
  readonly count: number
}

/**
 * A shapeless recipe definition.
 * Position of ingredients doesn't matter, only counts.
 */
export interface IRecipe {
  /** Unique identifier for this recipe */
  readonly id: string
  /** Display name for the recipe result */
  readonly name: string
  /** Ingredients required (shapeless - order doesn't matter) */
  readonly ingredients: ReadonlyArray<IRecipeIngredient>
  /** Factory function to create the result item */
  readonly createResult: () => IItem
  /** Number of result items produced */
  readonly resultCount: number
}

/**
 * Aggregated ingredient counts from crafting slots.
 */
export interface IIngredientCounts {
  /** Map of item ID to count */
  readonly byId: ReadonlyMap<string, number>
  /** Map of tag to total count of items with that tag */
  readonly byTag: ReadonlyMap<string, number>
}

/**
 * Central registry for all crafting recipes.
 * Handles recipe registration and matching against available ingredients.
 */
export class RecipeRegistry {
  private readonly recipes: Map<string, IRecipe> = new Map()

  /**
   * Register a new recipe.
   */
  register(recipe: IRecipe): void {
    if (this.recipes.has(recipe.id)) {
      console.warn(`Recipe ${recipe.id} already registered, overwriting`)
    }
    this.recipes.set(recipe.id, recipe)
  }

  /**
   * Get all registered recipes.
   */
  getAllRecipes(): ReadonlyArray<IRecipe> {
    return Array.from(this.recipes.values())
  }

  /**
   * Get a recipe by ID.
   */
  getRecipe(id: string): IRecipe | undefined {
    return this.recipes.get(id)
  }

  /**
   * Find all recipes that can be crafted with the given ingredients.
   * Recipes are sorted by how many ingredient types match (highest first).
   */
  findCraftableRecipes(ingredients: IIngredientCounts): IRecipe[] {
    const craftable = this.getAllRecipes().filter((recipe) => this.canCraft(recipe, ingredients))

    // Sort by number of matching ingredient types (descending)
    craftable.sort((a, b) => {
      const matchA = this.countMatchingIngredients(a, ingredients)
      const matchB = this.countMatchingIngredients(b, ingredients)
      return matchB - matchA
    })

    return craftable
  }

  /**
   * Count how many unique ingredient types in the recipe match items in the crafting grid.
   */
  private countMatchingIngredients(recipe: IRecipe, ingredients: IIngredientCounts): number {
    let count = 0

    for (const ingredient of recipe.ingredients) {
      if (ingredient.itemId) {
        // Check if item ID exists in the grid
        if (ingredients.byId.has(ingredient.itemId)) {
          count++
        }
      } else if (ingredient.tag) {
        // Check if any item with this tag exists in the grid
        if (ingredients.byTag.has(ingredient.tag)) {
          count++
        }
      }
    }

    return count
  }

  /**
   * Check if a recipe can be crafted with the given ingredients.
   */
  canCraft(recipe: IRecipe, ingredients: IIngredientCounts): boolean {
    // Track consumed ingredients to handle multiple ingredients using same tag
    const consumedById = new Map<string, number>()
    const consumedByTag = new Map<string, number>()

    for (const ingredient of recipe.ingredients) {
      const required = ingredient.count

      if (ingredient.itemId) {
        // Match by exact item ID
        const available =
          (ingredients.byId.get(ingredient.itemId) ?? 0) - (consumedById.get(ingredient.itemId) ?? 0)
        if (available < required) return false
        consumedById.set(ingredient.itemId, (consumedById.get(ingredient.itemId) ?? 0) + required)
      } else if (ingredient.tag) {
        // Match by tag
        const available =
          (ingredients.byTag.get(ingredient.tag) ?? 0) - (consumedByTag.get(ingredient.tag) ?? 0)
        if (available < required) return false
        consumedByTag.set(ingredient.tag, (consumedByTag.get(ingredient.tag) ?? 0) + required)
      }
    }

    return true
  }
}

// Singleton instance
export const recipeRegistry = new RecipeRegistry()
