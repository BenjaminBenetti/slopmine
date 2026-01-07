import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { DiamondPickaxeItem } from '../../items/tools/pickaxe/DiamondPickaxeItem.ts'
import { DiamondShovelItem } from '../../items/tools/shovel/DiamondShovelItem.ts'
import { DiamondAxeItem } from '../../items/tools/axe/DiamondAxeItem.ts'

export const diamondPickaxeRecipe: IRecipe = {
  id: 'diamond_pickaxe',
  name: 'Diamond Pickaxe',
  ingredients: [{ itemId: 'diamond', count: 3 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new DiamondPickaxeItem(),
  resultCount: 1,
}

export const diamondShovelRecipe: IRecipe = {
  id: 'diamond_shovel',
  name: 'Diamond Shovel',
  ingredients: [{ itemId: 'diamond', count: 1 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new DiamondShovelItem(),
  resultCount: 1,
}

export const diamondAxeRecipe: IRecipe = {
  id: 'diamond_axe',
  name: 'Diamond Axe',
  ingredients: [{ itemId: 'diamond', count: 2 }, { tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new DiamondAxeItem(),
  resultCount: 1,
}

export const diamondToolRecipes: IRecipe[] = [diamondPickaxeRecipe, diamondShovelRecipe, diamondAxeRecipe]
