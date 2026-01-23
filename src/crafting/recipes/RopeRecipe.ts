import type { IRecipe } from '../RecipeRegistry.ts'
import { RopeItem } from '../../items/materials/rope/RopeItem.ts'

export const ropeRecipe: IRecipe = {
  id: 'rope',
  name: 'Rope',
  ingredients: [{ itemId: 'hemp_fiber', count: 2 }],
  createResult: () => new RopeItem(),
  resultCount: 1,
}

export const ropeRecipes: IRecipe[] = [ropeRecipe]
