import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { DiviningStickBlockItem } from '../../items/blocks/divining_stick/DiviningStickBlockItem.ts'

export const diviningStickRecipe: IRecipe = {
  id: 'divining_stick',
  name: 'Divining Stick',
  ingredients: [
    { tag: ItemTags.WOOD, count: 2 },
  ],
  createResult: () => new DiviningStickBlockItem(),
  resultCount: 1,
}

export const diviningStickRecipes: IRecipe[] = [diviningStickRecipe]
