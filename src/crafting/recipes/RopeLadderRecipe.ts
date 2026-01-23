import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { RopeLadderBlockItem } from '../../items/blocks/rope_ladder/RopeLadderBlockItem.ts'

/**
 * Recipe for crafting rope ladders.
 * 2 rope + 1 wood = 4 rope ladders
 */
export const ropeLadderRecipe: IRecipe = {
  id: 'rope_ladder',
  name: 'Rope Ladder',
  ingredients: [
    { itemId: 'rope', count: 2 },
    { tag: ItemTags.WOOD, count: 1 },
  ],
  createResult: () => new RopeLadderBlockItem(),
  resultCount: 4,
}

export const ropeLadderRecipes: IRecipe[] = [ropeLadderRecipe]
