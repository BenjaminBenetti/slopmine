import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { ResinTorchBlockItem } from '../../items/blocks/resin_torch/ResinTorchBlockItem.ts'

/**
 * Resin torch: the upgraded torch. Pine resin (bonus drop from pine logs)
 * burned over a dried-moss wick on a wooden post - both new-biome materials
 * combined into the brightest light source the engine supports (blocklight
 * 15 vs the standard torch's 14). Yields 4 (vs the coal torch's 8) since
 * the ingredients are richer.
 */
export const resinTorchRecipe: IRecipe = {
  id: 'resin_torch',
  name: 'Resin Torch',
  ingredients: [
    { tag: ItemTags.WOOD, count: 1 },
    { itemId: 'pine_resin', count: 1 },
    { itemId: 'dried_moss', count: 1 },
  ],
  createResult: () => new ResinTorchBlockItem(),
  resultCount: 4,
}

export const pineLogRecipes: IRecipe[] = [resinTorchRecipe]
