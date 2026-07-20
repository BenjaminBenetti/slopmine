import type { IRecipe } from '../RecipeRegistry.ts'
import { ResinTapBlockItem } from '../../items/blocks/resin_tap/ResinTapBlockItem.ts'

/**
 * Resin tap: an iron spout on a pine-plank pail. Hang it on a pine log
 * to slowly harvest pine resin.
 */
export const resinTapRecipe: IRecipe = {
  id: 'resin_tap',
  name: 'Resin Tap',
  ingredients: [
    { itemId: 'iron_bar', count: 1 },
    { itemId: 'pine_planks_block', count: 2 },
  ],
  createResult: () => new ResinTapBlockItem(),
  resultCount: 1,
}

export const resinTapRecipes: IRecipe[] = [resinTapRecipe]
