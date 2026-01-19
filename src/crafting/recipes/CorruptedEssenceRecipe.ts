import type { IRecipe } from '../RecipeRegistry.ts'
import { CorruptedEssenceItem } from '../../items/materials/corrupted_essence/CorruptedEssenceItem.ts'

export const corruptedEssenceRecipe: IRecipe = {
  id: 'corrupted_essence',
  name: 'Corrupted Essence',
  ingredients: [
    { itemId: 'corrupted_hell_rock_block', count: 1 },
  ],
  createResult: () => new CorruptedEssenceItem(),
  resultCount: 1,
}
