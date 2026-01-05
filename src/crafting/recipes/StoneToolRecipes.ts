import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { StonePickaxeItem } from '../../items/tools/pickaxe/StonePickaxeItem.ts'
import { StoneShovelItem } from '../../items/tools/shovel/StoneShovelItem.ts'
import { StoneAxeItem } from '../../items/tools/axe/StoneAxeItem.ts'

export const stonePickaxeRecipe: IRecipe = {
  id: 'stone_pickaxe',
  name: 'Stone Pickaxe',
  ingredients: [{ tag: ItemTags.STONE, count: 3 }],
  createResult: () => new StonePickaxeItem(),
  resultCount: 1,
}

export const stoneShovelRecipe: IRecipe = {
  id: 'stone_shovel',
  name: 'Stone Shovel',
  ingredients: [{ tag: ItemTags.STONE, count: 1 }],
  createResult: () => new StoneShovelItem(),
  resultCount: 1,
}

export const stoneAxeRecipe: IRecipe = {
  id: 'stone_axe',
  name: 'Stone Axe',
  ingredients: [{ tag: ItemTags.STONE, count: 2 }],
  createResult: () => new StoneAxeItem(),
  resultCount: 1,
}

export const stoneToolRecipes: IRecipe[] = [stonePickaxeRecipe, stoneShovelRecipe, stoneAxeRecipe]
