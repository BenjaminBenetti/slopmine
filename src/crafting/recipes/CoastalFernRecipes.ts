import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { FiddleheadsItem } from '../../items/food/fiddleheads/FiddleheadsItem.ts'
import { CookedFiddleheadsItem } from '../../items/food/cooked_fiddleheads/CookedFiddleheadsItem.ts'

/**
 * Pick fiddleheads from a harvested coastal fern - each big sword fern
 * hides a couple of young curled shoots at its base.
 */
export const fiddleheadsRecipe: IRecipe = {
  id: 'fiddleheads',
  name: 'Fiddleheads',
  ingredients: [{ itemId: 'coastal_fern_block', count: 1 }],
  createResult: () => new FiddleheadsItem(),
  resultCount: 2,
}

/** All coastal fern hand crafting recipes */
export const coastalFernRecipes: IRecipe[] = [fiddleheadsRecipe]

/**
 * Cook fiddleheads in a forge - fern shoots are quick to fire but
 * shouldn't be eaten raw.
 */
export const cookFiddleheadsRecipe: ISmeltingRecipe = {
  id: 'cook_fiddleheads',
  name: 'Cooked Fiddleheads',
  inputId: 'fiddleheads',
  createResult: () => new CookedFiddleheadsItem(),
  resultCount: 1,
  smeltTime: 4, // 4 seconds - tender shoots cook quickly
}

/** All coastal fern smelting (cooking) recipes */
export const coastalFernSmeltingRecipes: ISmeltingRecipe[] = [cookFiddleheadsRecipe]
