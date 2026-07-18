import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { PineNeedleTeaItem } from '../../items/food/pine_needle_tea/PineNeedleTeaItem.ts'

/**
 * Pine needle tea - a cheap early-game brew from gathered pine needles.
 * Weaker than herb potions, but pine needles are plentiful in pine biomes.
 */
export const brewPineNeedleTeaRecipe: IBrewingRecipe = {
  id: 'brew_pine_needle_tea',
  name: 'Pine Needle Tea',
  ingredients: [{ itemId: 'pine_needles_block', count: 3 }],
  createResult: () => new PineNeedleTeaItem(),
  resultCount: 1,
  brewTime: 8, // Faster than potions - it's just tea
}

/** All pine needle brewing recipes */
export const pineNeedleBrewingRecipes: IBrewingRecipe[] = [brewPineNeedleTeaRecipe]
