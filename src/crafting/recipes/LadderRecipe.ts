import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { LadderBlockItem } from '../../items/blocks/ladder/LadderBlockItem.ts'

export const ladderRecipe: IRecipe = {
  id: 'ladder',
  name: 'Ladder',
  ingredients: [
    { tag: ItemTags.WOOD, count: 3 },
  ],
  createResult: () => new LadderBlockItem(),
  resultCount: 4,
}

export const ladderRecipes: IRecipe[] = [ladderRecipe]
