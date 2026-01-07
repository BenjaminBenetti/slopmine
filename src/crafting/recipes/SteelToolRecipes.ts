import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { SteelPickaxeItem } from '../../items/tools/pickaxe/SteelPickaxeItem.ts'
import { SteelShovelItem } from '../../items/tools/shovel/SteelShovelItem.ts'
import { SteelAxeItem } from '../../items/tools/axe/SteelAxeItem.ts'

export const steelPickaxeRecipe: IRecipe = {
  id: 'steel_pickaxe',
  name: 'Steel Pickaxe',
  ingredients: [{ itemId: 'steel_bar', count: 3 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new SteelPickaxeItem(),
  resultCount: 1,
}

export const steelShovelRecipe: IRecipe = {
  id: 'steel_shovel',
  name: 'Steel Shovel',
  ingredients: [{ itemId: 'steel_bar', count: 1 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new SteelShovelItem(),
  resultCount: 1,
}

export const steelAxeRecipe: IRecipe = {
  id: 'steel_axe',
  name: 'Steel Axe',
  ingredients: [{ itemId: 'steel_bar', count: 2 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new SteelAxeItem(),
  resultCount: 1,
}

export const steelToolRecipes: IRecipe[] = [steelPickaxeRecipe, steelShovelRecipe, steelAxeRecipe]
