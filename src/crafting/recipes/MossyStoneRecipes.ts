import type { IRecipe } from '../RecipeRegistry.ts'
import { MossyStoneBlockItem } from '../../items/blocks/mossy_stone/MossyStoneBlockItem.ts'

/**
 * Hand-craft mossy stone by spreading moss over stone.
 *
 * One moss block covers two stone blocks (2 stone + 1 moss -> 2 mossy
 * stone), so the conversion is stone-conserving and moss acts as the
 * "seasoning" ingredient — mirroring the batch-output precedent of the
 * torch recipe for cheap decorative blocks.
 *
 * The stone ingredient deliberately matches by exact item ID rather than
 * the 'stone' tag: MossyStoneBlockItem itself carries the 'stone' tag, so
 * a tag-based ingredient would let mossy stone satisfy its own recipe and
 * silently consume moss for nothing.
 */
export const mossyStoneRecipe: IRecipe = {
  id: 'mossy_stone',
  name: 'Mossy Stone',
  ingredients: [
    { itemId: 'stone_block', count: 2 },
    { itemId: 'moss_block', count: 1 },
  ],
  createResult: () => new MossyStoneBlockItem(),
  resultCount: 2,
}

export const mossyStoneRecipes: IRecipe[] = [mossyStoneRecipe]
