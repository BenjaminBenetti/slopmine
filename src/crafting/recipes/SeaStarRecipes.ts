import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { HealthPotion2Item } from '../../items/potions/health_potion_2/HealthPotion2Item.ts'

/**
 * Alternate route to Healing Potion II using a sea star instead of a
 * mushroom cap. Sea stars regrow lost arms, and that regenerative spark
 * survives the brewing kettle - coastal foragers can skip the mushroom
 * caves entirely.
 */
export const brewHealthPotion2SeaStarRecipe: IBrewingRecipe = {
  id: 'brew_health_potion_2_sea_star',
  name: 'Healing Potion II',
  ingredients: [
    { itemId: 'herb', count: 1 },
    { itemId: 'sea_star_block', count: 1 },
  ],
  createResult: () => new HealthPotion2Item(),
  resultCount: 1,
  brewTime: 15, // Matches the mushroom route - same potion, same patience
}

/** All sea star brewing recipes */
export const seaStarBrewingRecipes: IBrewingRecipe[] = [brewHealthPotion2SeaStarRecipe]
