import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { StickItem } from '../../items/materials/stick/StickItem.ts'

// Deliberately wasteful vs the woodworking bench: a whole log yields 4 sticks
// here, while the bench route (log -> 4 planks -> 4 sticks each) yields 16.
export const stickRecipe: IRecipe = {
  id: 'stick',
  name: 'Stick',
  ingredients: [{ tag: ItemTags.LOG, count: 1 }],
  createResult: () => new StickItem(),
  resultCount: 4,
}

// Hand-carving a plank recovers half of what the bench gets from it,
// keeping the yield ladder monotone: log by hand (4/log) < planks by
// hand (8/log) < planks at the bench (16/log).
export const stickFromPlanksRecipe: IRecipe = {
  id: 'stick_from_planks',
  name: 'Stick',
  ingredients: [{ tag: ItemTags.PLANK, count: 1 }],
  createResult: () => new StickItem(),
  resultCount: 2,
}

export const stickRecipes: IRecipe[] = [stickRecipe, stickFromPlanksRecipe]
