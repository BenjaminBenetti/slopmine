import { recipeRegistry } from '../RecipeRegistry.ts'
import { woodToolRecipes } from './WoodToolRecipes.ts'
import { stoneToolRecipes } from './StoneToolRecipes.ts'
import { ironToolRecipes } from './IronToolRecipes.ts'
import { steelToolRecipes } from './SteelToolRecipes.ts'
import { diamondToolRecipes } from './DiamondToolRecipes.ts'
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
  for (const recipe of ironToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of steelToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of diamondToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of torchRecipes) {
    recipeRegistry.register(recipe)
  }
}

export { woodToolRecipes } from './WoodToolRecipes.ts'
export { stoneToolRecipes } from './StoneToolRecipes.ts'
export { ironToolRecipes } from './IronToolRecipes.ts'
export { steelToolRecipes } from './SteelToolRecipes.ts'
export { diamondToolRecipes } from './DiamondToolRecipes.ts'
export { torchRecipes } from './TorchRecipe.ts'
