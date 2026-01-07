import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { TorchBlockItem } from '../../items/blocks/torch/TorchBlockItem.ts'

export const torchRecipe: IRecipe = {
  id: 'torch',
  name: 'Torch',
  ingredients: [
    { tag: ItemTags.WOOD, count: 1 },
    { itemId: 'coal', count: 1 },
  ],
  createResult: () => new TorchBlockItem(),
  resultCount: 8,
}

export const torchRecipes: IRecipe[] = [torchRecipe]
