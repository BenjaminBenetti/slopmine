import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { CookedCrabMeatItem } from '../../items/food/cooked_crab_meat/CookedCrabMeatItem.ts'

/**
 * Smelting (forge cooking) recipes for crab drops.
 * Registered centrally in recipes/index.ts alongside the other smelting recipes.
 */
export const cookRawCrabMeatRecipe: ISmeltingRecipe = {
  id: 'cook_raw_crab_meat',
  name: 'Cooked Crab Meat',
  inputId: 'raw_crab_meat',
  createResult: () => new CookedCrabMeatItem(),
  resultCount: 1,
  smeltTime: 4, // 4 seconds - crab meat is delicate and cooks quickly
}

/** All crab smelting recipes */
export const crabSmeltingRecipes: ISmeltingRecipe[] = [cookRawCrabMeatRecipe]
