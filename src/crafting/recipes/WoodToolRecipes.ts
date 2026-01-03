import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { WoodPickaxeItem } from '../../items/tools/pickaxe/WoodPickaxeItem.ts'
import { WoodShovelItem } from '../../items/tools/shovel/WoodShovelItem.ts'
import { WoodAxeItem } from '../../items/tools/axe/WoodAxeItem.ts'

export const woodPickaxeRecipe: IRecipe = {
  id: 'wood_pickaxe',
  name: 'Wood Pickaxe',
  ingredients: [{ tag: ItemTags.WOOD, count: 3 }],
  createResult: () => new WoodPickaxeItem(),
  resultCount: 1,
}

export const woodShovelRecipe: IRecipe = {
  id: 'wood_shovel',
  name: 'Wood Shovel',
  ingredients: [{ tag: ItemTags.WOOD, count: 1 }],
  createResult: () => new WoodShovelItem(),
  resultCount: 1,
}

export const woodAxeRecipe: IRecipe = {
  id: 'wood_axe',
  name: 'Wood Axe',
  ingredients: [{ tag: ItemTags.WOOD, count: 2 }],
  createResult: () => new WoodAxeItem(),
  resultCount: 1,
}

export const woodToolRecipes: IRecipe[] = [woodPickaxeRecipe, woodShovelRecipe, woodAxeRecipe]
