import type { IRecipe } from '../RecipeRegistry.ts'
import { CrystalLampBlockItem } from '../../items/blocks/crystal_lamp/CrystalLampBlockItem.ts'
import { PolishedAbyssalStoneBlockItem } from '../../items/blocks/polished_abyssal_stone/PolishedAbyssalStoneBlockItem.ts'
import { AbyssalBricksBlockItem } from '../../items/blocks/abyssal_bricks/AbyssalBricksBlockItem.ts'

/**
 * Crystal Abyss hand recipes. Ingredients match exact item ids so the
 * decorative stone variants never satisfy each other's recipes.
 */

/** Crystal lamp: prism shards behind glass - the brightest craftable light. */
export const crystalLampRecipe: IRecipe = {
  id: 'crystal_lamp',
  name: 'Crystal Lamp',
  ingredients: [
    { itemId: 'prism_shard', count: 4 },
    { itemId: 'glass_block', count: 1 },
  ],
  createResult: () => new CrystalLampBlockItem(),
  resultCount: 2,
}

/** Polished abyssal stone: hone raw abyssal stone (block-conserving). */
export const polishedAbyssalStoneRecipe: IRecipe = {
  id: 'polished_abyssal_stone',
  name: 'Polished Abyssal Stone',
  ingredients: [{ itemId: 'abyssal_stone_block', count: 4 }],
  createResult: () => new PolishedAbyssalStoneBlockItem(),
  resultCount: 4,
}

/** Abyssal bricks: cut from polished abyssal stone (block-conserving). */
export const abyssalBricksRecipe: IRecipe = {
  id: 'abyssal_bricks',
  name: 'Abyssal Bricks',
  ingredients: [{ itemId: 'polished_abyssal_stone_block', count: 4 }],
  createResult: () => new AbyssalBricksBlockItem(),
  resultCount: 4,
}

export const crystalAbyssRecipes: IRecipe[] = [
  crystalLampRecipe,
  polishedAbyssalStoneRecipe,
  abyssalBricksRecipe,
]
