import { recipeRegistry } from '../RecipeRegistry.ts'
import { smeltingRegistry } from '../../smelting/index.ts'
import { brewingRegistry } from '../../brewing/index.ts'
import { woodToolRecipes } from './WoodToolRecipes.ts'
import { stoneToolRecipes } from './StoneToolRecipes.ts'
import { ironToolRecipes } from './IronToolRecipes.ts'
import { steelToolRecipes } from './SteelToolRecipes.ts'
import { diamondToolRecipes } from './DiamondToolRecipes.ts'
import { torchRecipes } from './TorchRecipe.ts'
import { ladderRecipes } from './LadderRecipe.ts'
import { groundWheatRecipe } from './WheatRecipe.ts'
import { corruptedEssenceRecipe } from './CorruptedEssenceRecipe.ts'
import { ropeRecipes } from './RopeRecipe.ts'
import { bedRecipes } from './BedRecipe.ts'
import { ropeLadderRecipes } from './RopeLadderRecipe.ts'
import { workstationRecipes } from './WorkstationRecipes.ts'
import { smeltingRecipes } from './SmeltingRecipes.ts'
import { brewingRecipes } from './BrewingRecipes.ts'
import { diviningStickRecipes } from './DiviningStickRecipe.ts'

/**
 * Register all default recipes.
 * Call this at startup.
 */
export function registerDefaultRecipes(): void {
  // Hand crafting recipes
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
  for (const recipe of ladderRecipes) {
    recipeRegistry.register(recipe)
  }
  recipeRegistry.register(groundWheatRecipe)
  recipeRegistry.register(corruptedEssenceRecipe)
  for (const recipe of ropeRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of bedRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of ropeLadderRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of workstationRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of diviningStickRecipes) {
    recipeRegistry.register(recipe)
  }

  // Smelting recipes
  for (const recipe of smeltingRecipes) {
    smeltingRegistry.register(recipe)
  }

  // Brewing recipes
  for (const recipe of brewingRecipes) {
    brewingRegistry.register(recipe)
  }
}

export { woodToolRecipes } from './WoodToolRecipes.ts'
export { stoneToolRecipes } from './StoneToolRecipes.ts'
export { ironToolRecipes } from './IronToolRecipes.ts'
export { steelToolRecipes } from './SteelToolRecipes.ts'
export { diamondToolRecipes } from './DiamondToolRecipes.ts'
export { torchRecipes } from './TorchRecipe.ts'
