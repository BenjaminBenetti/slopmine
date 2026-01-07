import { recipeRegistry } from '../RecipeRegistry.ts'
import { woodToolRecipes } from './WoodToolRecipes.ts'
import { stoneToolRecipes } from './StoneToolRecipes.ts'
import { torchRecipes } from './TorchRecipe.ts'

/**
 * Register all default recipes.
 * Call this at startup.
 */
export function registerDefaultRecipes(): void {
  for (const recipe of woodToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of stoneToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of torchRecipes) {
    recipeRegistry.register(recipe)
  }
}

export { woodToolRecipes } from './WoodToolRecipes.ts'
export { stoneToolRecipes } from './StoneToolRecipes.ts'
export { torchRecipes } from './TorchRecipe.ts'
