import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { BedBlockItem } from '../../items/blocks/bed/BedBlockItem.ts'

export const bedRecipe: IRecipe = {
  id: 'bed',
  name: 'Bed',
  ingredients: [
    { tag: ItemTags.WOOD, count: 2 },
    { itemId: 'hemp_fiber', count: 4 },
  ],
  createResult: () => new BedBlockItem(),
  resultCount: 1,
}

export const bedRecipes: IRecipe[] = [bedRecipe]
