import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { ChestBlockItem } from '../../items/blocks/chest/ChestBlockItem.ts'

export const chestRecipe: IRecipe = {
  id: 'chest',
  name: 'Chest',
  ingredients: [{ tag: ItemTags.PLANK, count: 8 }],
  createResult: () => new ChestBlockItem(),
  resultCount: 1,
}

export const chestRecipes: IRecipe[] = [chestRecipe]
