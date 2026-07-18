import type { IRecipe } from '../RecipeRegistry.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { ForgeBlockItem } from '../../items/blocks/forge/ForgeBlockItem.ts'
import { ApothecaryWorkbenchBlockItem } from '../../items/blocks/apothecary_workbench/ApothecaryWorkbenchBlockItem.ts'
import { WoodworkingBenchBlockItem } from '../../items/blocks/woodworking_bench/WoodworkingBenchBlockItem.ts'

export const forgeRecipe: IRecipe = {
  id: 'craft_forge',
  name: 'Forge',
  ingredients: [{ itemId: 'stone_block', count: 4 }],
  createResult: () => new ForgeBlockItem(),
  resultCount: 1,
}

export const apothecaryWorkbenchRecipe: IRecipe = {
  id: 'craft_apothecary_workbench',
  name: 'Apothecary Workbench',
  ingredients: [
    { itemId: 'stone_block', count: 4 },
    { itemId: 'glass_block', count: 2 },
  ],
  createResult: () => new ApothecaryWorkbenchBlockItem(),
  resultCount: 1,
}

export const woodworkingBenchRecipe: IRecipe = {
  id: 'craft_woodworking_bench',
  name: 'Woodworking Bench',
  ingredients: [
    { itemId: 'stone_block', count: 4 },
    // Any log works - pine/redwood biome starts shouldn't be locked out
    { tag: ItemTags.LOG, count: 2 },
  ],
  createResult: () => new WoodworkingBenchBlockItem(),
  resultCount: 1,
}

/** All workstation crafting recipes */
export const workstationRecipes: IRecipe[] = [
  forgeRecipe,
  apothecaryWorkbenchRecipe,
  woodworkingBenchRecipe,
]
