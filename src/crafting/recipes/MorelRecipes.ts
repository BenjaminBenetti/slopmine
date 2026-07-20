import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { CookedMorelItem } from '../../items/food/cooked_morel/CookedMorelItem.ts'

/**
 * Roast a morel in a forge - morels are inedible raw (the raw mushroom is a
 * replantable block item), but a quick roast makes a hearty forest meal.
 */
export const cookMorelRecipe: ISmeltingRecipe = {
  id: 'cook_morel',
  name: 'Cooked Morel',
  inputId: 'morel_mushroom_block',
  createResult: () => new CookedMorelItem(),
  resultCount: 1,
  smeltTime: 5, // a little longer than fiddleheads - dense honeycomb flesh
}

/** All morel smelting (cooking) recipes */
export const morelSmeltingRecipes: ISmeltingRecipe[] = [cookMorelRecipe]
