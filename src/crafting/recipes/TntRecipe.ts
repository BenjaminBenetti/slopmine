import type { IRecipe } from '../RecipeRegistry.ts'
import { TntBlockItem } from '../../items/blocks/tnt/TntBlockItem.ts'

/**
 * TNT: sulfur (from volcanic sulfur ore) packed with charcoal.
 * Shapeless hand-crafting recipe (fits the 3x2 crafting grid).
 */
export const tntRecipe: IRecipe = {
  id: 'tnt',
  name: 'TNT',
  ingredients: [
    { itemId: 'sulfur', count: 4 },
    { itemId: 'charcoal', count: 2 },
  ],
  createResult: () => new TntBlockItem(),
  resultCount: 1,
}

export const tntRecipes: IRecipe[] = [tntRecipe]
