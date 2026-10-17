import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { IronAxeItem } from '../../items/tools/axe/IronAxeItem.ts'
import { IronShovelItem } from '../../items/tools/shovel/IronShovelItem.ts'
import { BoneMealItem } from '../../items/materials/bone_meal/BoneMealItem.ts'
import { SlimeBallItem } from '../../items/materials/slime_ball/SlimeBallItem.ts'
import { SlimeBlockItem } from '../../items/blocks/slime/SlimeBlockItem.ts'
import { CookedVenisonItem } from '../../items/food/cooked_venison/CookedVenisonItem.ts'

/**
 * Progression gap-fillers: the missing iron tools, and uses for dead-end
 * drops (bone → bone meal, slime balls → slime block, venison → cooked).
 */

// Iron tools (the pickaxe lives in IronToolRecipes.ts; same costs as steel/diamond)
export const ironShovelRecipe: IRecipe = {
  id: 'iron_shovel',
  name: 'Iron Shovel',
  ingredients: [{ itemId: 'iron_bar', count: 1 }, { itemId: 'stick', count: 2 }],
  createResult: () => new IronShovelItem(),
  resultCount: 1,
}

export const ironAxeRecipe: IRecipe = {
  id: 'iron_axe',
  name: 'Iron Axe',
  ingredients: [{ itemId: 'iron_bar', count: 2 }, { itemId: 'stick', count: 2 }],
  createResult: () => new IronAxeItem(),
  resultCount: 1,
}

// Bone meal fertilizer (right-click crops; see src/progression/BoneMeal.ts)
export const boneMealRecipe: IRecipe = {
  id: 'bone_meal',
  name: 'Bone Meal',
  ingredients: [{ itemId: 'bone', count: 1 }],
  createResult: () => new BoneMealItem(),
  resultCount: 3,
}

// Slime block (fall cushion + bounce) and back
export const slimeBlockRecipe: IRecipe = {
  id: 'slime_block',
  name: 'Slime Block',
  ingredients: [{ itemId: 'slime_ball', count: 4 }],
  createResult: () => new SlimeBlockItem(),
  resultCount: 1,
}

export const slimeBallsFromBlockRecipe: IRecipe = {
  id: 'slime_ball_from_block',
  name: 'Slime Ball',
  ingredients: [{ itemId: 'slime_block', count: 1 }],
  createResult: () => new SlimeBallItem(),
  resultCount: 4,
}

export const progressionHandRecipes: IRecipe[] = [
  ironShovelRecipe,
  ironAxeRecipe,
  boneMealRecipe,
  slimeBlockRecipe,
  slimeBallsFromBlockRecipe,
]

// Forge: deer meat (item id 'venison') cooks like every other raw meat
export const cookVenisonRecipe: ISmeltingRecipe = {
  id: 'cook_venison',
  name: 'Cooked Venison',
  inputId: 'venison',
  createResult: () => new CookedVenisonItem(),
  resultCount: 1,
  smeltTime: 6,
}

export const progressionSmeltingRecipes: ISmeltingRecipe[] = [cookVenisonRecipe]
