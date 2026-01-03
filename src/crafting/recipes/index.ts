import { recipeRegistry } from '../RecipeRegistry.ts'
import { woodToolRecipes } from './WoodToolRecipes.ts'

/**
 * Register all default recipes.
 * Call this at startup.
 */
export function registerDefaultRecipes(): void {
  for (const recipe of woodToolRecipes) {
    recipeRegistry.register(recipe)
  }
}

export { woodToolRecipes } from './WoodToolRecipes.ts'
