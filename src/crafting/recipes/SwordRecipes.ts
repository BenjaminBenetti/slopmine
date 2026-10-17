import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { WoodSwordItem } from '../../items/weapons/sword/WoodSwordItem.ts'
import { StoneSwordItem } from '../../items/weapons/sword/StoneSwordItem.ts'
import { IronSwordItem } from '../../items/weapons/sword/IronSwordItem.ts'
import { SteelSwordItem } from '../../items/weapons/sword/SteelSwordItem.ts'
import { DiamondSwordItem } from '../../items/weapons/sword/DiamondSwordItem.ts'

// Hand-crafted swords: 2 material + 1 stick. Infernium and hellbane swords
// are forged at the Hellforge (src/hellforge/HellforgeRecipes.ts).

export const woodSwordRecipe: IRecipe = {
  id: 'wood_sword',
  name: 'Wood Sword',
  ingredients: [{ tag: ItemTags.WOOD, count: 2 }, { itemId: 'stick', count: 1 }],
  createResult: () => new WoodSwordItem(),
  resultCount: 1,
}

export const stoneSwordRecipe: IRecipe = {
  id: 'stone_sword',
  name: 'Stone Sword',
  ingredients: [{ tag: ItemTags.STONE, count: 2 }, { itemId: 'stick', count: 1 }],
  createResult: () => new StoneSwordItem(),
  resultCount: 1,
}

export const ironSwordRecipe: IRecipe = {
  id: 'iron_sword',
  name: 'Iron Sword',
  ingredients: [{ itemId: 'iron_bar', count: 2 }, { itemId: 'stick', count: 1 }],
  createResult: () => new IronSwordItem(),
  resultCount: 1,
}

export const steelSwordRecipe: IRecipe = {
  id: 'steel_sword',
  name: 'Steel Sword',
  ingredients: [{ itemId: 'steel_bar', count: 2 }, { itemId: 'stick', count: 1 }],
  createResult: () => new SteelSwordItem(),
  resultCount: 1,
}

export const diamondSwordRecipe: IRecipe = {
  id: 'diamond_sword',
  name: 'Diamond Sword',
  ingredients: [{ itemId: 'diamond', count: 2 }, { itemId: 'stick', count: 1 }],
  createResult: () => new DiamondSwordItem(),
  resultCount: 1,
}

export const swordRecipes: IRecipe[] = [
  woodSwordRecipe,
  stoneSwordRecipe,
  ironSwordRecipe,
  steelSwordRecipe,
  diamondSwordRecipe,
]
