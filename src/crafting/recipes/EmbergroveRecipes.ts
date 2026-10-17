import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import type { IWoodworkingRecipe } from '../../woodworking/interfaces/IWoodworkingRecipe.ts'
import { EmberwoodPlanksBlockItem } from '../../items/blocks/emberwood_planks/EmberwoodPlanksBlockItem.ts'
import { EmberwoodStairsBlockItem } from '../../items/blocks/emberwood_stairs/EmberwoodStairsBlockItem.ts'
import { RoastedGlowcapItem } from '../../items/food/roasted_glowcap/RoastedGlowcapItem.ts'
import { CookedEmberHogItem } from '../../items/food/cooked_ember_hog/CookedEmberHogItem.ts'

/**
 * Ember Grove recipes: emberwood planks (bench and by hand, so players can
 * build in Hell without hauling a woodworking bench down) and cooking.
 * Sticks, torches, wood tools, chests and charcoal come from the shared
 * tag recipes: emberwood stems are `wood` + `log`, planks `wood` + `plank`.
 */

/** Bench: one stem → 4 planks (same yield as every other log). */
export const emberwoodPlanksWoodworkingRecipe: IWoodworkingRecipe = {
  id: 'emberwood-planks',
  name: 'Emberwood Planks',
  inputItemId: 'emberwood_stem_block',
  inputCount: 1,
  createResult: () => new EmberwoodPlanksBlockItem(),
  resultCount: 4,
}

/** Bench: 3 planks → 2 stairs (like every other wood). */
export const emberwoodStairsWoodworkingRecipe: IWoodworkingRecipe = {
  id: 'emberwood-stairs',
  name: 'Emberwood Stairs',
  inputItemId: 'emberwood_planks_block',
  inputCount: 3,
  createResult: () => new EmberwoodStairsBlockItem(),
  resultCount: 2,
}

/** By hand: half the bench yield (the bench stays worth building). */
export const emberwoodPlanksHandRecipe: IRecipe = {
  id: 'emberwood_planks_by_hand',
  name: 'Emberwood Planks',
  ingredients: [{ itemId: 'emberwood_stem_block', count: 1 }],
  createResult: () => new EmberwoodPlanksBlockItem(),
  resultCount: 2,
}

export const roastGlowcapRecipe: ISmeltingRecipe = {
  id: 'roast_glowcap',
  name: 'Roasted Glowcap',
  inputId: 'glowcap',
  createResult: () => new RoastedGlowcapItem(),
  resultCount: 1,
  smeltTime: 4,
}

export const cookEmberHogRecipe: ISmeltingRecipe = {
  id: 'cook_ember_hog',
  name: 'Cooked Ember Hog',
  inputId: 'raw_ember_hog',
  createResult: () => new CookedEmberHogItem(),
  resultCount: 1,
  smeltTime: 6,
}

export const embergroveHandRecipes: IRecipe[] = [emberwoodPlanksHandRecipe]
export const embergroveWoodworkingRecipes: IWoodworkingRecipe[] = [emberwoodPlanksWoodworkingRecipe, emberwoodStairsWoodworkingRecipe]
export const embergroveSmeltingRecipes: ISmeltingRecipe[] = [roastGlowcapRecipe, cookEmberHogRecipe]
