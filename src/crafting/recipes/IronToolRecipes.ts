import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { IronPickaxeItem } from '../../items/tools/pickaxe/IronPickaxeItem.ts'

export const ironPickaxeRecipe: IRecipe = {
  id: 'iron_pickaxe',
  name: 'Iron Pickaxe',
  ingredients: [{ itemId: 'iron_bar', count: 3 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new IronPickaxeItem(),
  resultCount: 1,
}

export const ironToolRecipes: IRecipe[] = [ironPickaxeRecipe]
