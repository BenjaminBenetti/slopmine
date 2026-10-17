import type { IRecipe } from '../RecipeRegistry.ts'
import { SigilCompassItem } from '../../items/magic/sigil_compass/SigilCompassItem.ts'

/** Sigil Compass: points to the nearest dungeon of the Hell biome you are in. */
export const sigilCompassRecipe: IRecipe = {
  id: 'sigil_compass',
  name: 'Sigil Compass',
  ingredients: [
    { itemId: 'gold_bar', count: 2 },
    { itemId: 'iron_bar', count: 1 },
    { itemId: 'corrupted_essence', count: 1 },
  ],
  createResult: () => new SigilCompassItem(),
  resultCount: 1,
}

export const dungeonHandRecipes: IRecipe[] = [sigilCompassRecipe]
