import type { IRecipe } from '../RecipeRegistry.ts'
import { GroundWheatItem } from '../../items/food/ground_wheat/GroundWheatItem.ts'

export const groundWheatRecipe: IRecipe = {
  id: 'ground_wheat',
  name: 'Ground Wheat',
  ingredients: [{ itemId: 'wheat', count: 1 }],
  createResult: () => new GroundWheatItem(),
  resultCount: 1,
}
