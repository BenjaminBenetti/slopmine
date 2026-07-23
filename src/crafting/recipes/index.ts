import { recipeRegistry } from '../RecipeRegistry.ts'
import { smeltingRegistry } from '../../smelting/index.ts'
import { brewingRegistry } from '../../brewing/index.ts'
import { woodworkingRegistry } from '../../woodworking/index.ts'
import { carpentryWoodworkingRecipes, carpentryHandRecipes } from './CarpentryRecipes.ts'
import { stickRecipes } from './StickRecipes.ts'
import { chestRecipes } from './ChestRecipe.ts'
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
import { mossyStoneRecipes } from './MossyStoneRecipes.ts'
import { pineLogRecipes } from './PineLogRecipes.ts'
import { coastalFernRecipes, coastalFernSmeltingRecipes } from './CoastalFernRecipes.ts'
import { mossSmeltingRecipes } from './MossRecipes.ts'
import { crabSmeltingRecipes } from './CrabRecipes.ts'
import { pineNeedleBrewingRecipes } from './PineNeedleRecipes.ts'
import { seaStarBrewingRecipes } from './SeaStarRecipes.ts'
import { pineconeRecipes } from './PineconeRecipes.ts'
import { resinTapRecipes } from './ResinTapRecipes.ts'
import { morelSmeltingRecipes } from './MorelRecipes.ts'
import { tntRecipes } from './TntRecipe.ts'

/**
 * Register all default recipes.
 * Call this at startup.
 */
export function registerDefaultRecipes(): void {
  // Hand crafting recipes
  for (const recipe of woodToolRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of pineconeRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of resinTapRecipes) {
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
  for (const recipe of tntRecipes) {
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
  for (const recipe of mossyStoneRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of pineLogRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of coastalFernRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of stickRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of chestRecipes) {
    recipeRegistry.register(recipe)
  }

  // Smelting recipes
  for (const recipe of smeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of mossSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of crabSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of coastalFernSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }
  for (const recipe of morelSmeltingRecipes) {
    smeltingRegistry.register(recipe)
  }

  // Brewing recipes
  for (const recipe of brewingRecipes) {
    brewingRegistry.register(recipe)
  }
  for (const recipe of pineNeedleBrewingRecipes) {
    brewingRegistry.register(recipe)
  }
  for (const recipe of seaStarBrewingRecipes) {
    brewingRegistry.register(recipe)
  }

  // Carpentry recipes (windows are hand-crafted; the rest run on the woodworking bench)
  for (const recipe of carpentryHandRecipes) {
    recipeRegistry.register(recipe)
  }
  for (const recipe of carpentryWoodworkingRecipes) {
    woodworkingRegistry.register(recipe)
  }
}

export { woodToolRecipes } from './WoodToolRecipes.ts'
export { stoneToolRecipes } from './StoneToolRecipes.ts'
export { ironToolRecipes } from './IronToolRecipes.ts'
export { steelToolRecipes } from './SteelToolRecipes.ts'
export { diamondToolRecipes } from './DiamondToolRecipes.ts'
export { torchRecipes } from './TorchRecipe.ts'
