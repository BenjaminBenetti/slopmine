import type { IRecipe } from '../RecipeRegistry.ts'
import { PolishedIceBlockItem } from '../../items/blocks/polished_ice/PolishedIceBlockItem.ts'
import { FrostLanternBlockItem } from '../../items/blocks/frost_lantern/FrostLanternBlockItem.ts'

/** Grind glacial ice smooth: 4 glacial ice -> 4 polished ice. */
export const polishedIceRecipe: IRecipe = {
  id: 'polished_ice',
  name: 'Polished Ice',
  ingredients: [{ itemId: 'glacial_ice_block', count: 4 }],
  createResult: () => new PolishedIceBlockItem(),
  resultCount: 4,
}

/** A rime crystal caged in iron, set in glacial ice: two cold lanterns. */
export const frostLanternRecipe: IRecipe = {
  id: 'frost_lantern',
  name: 'Frost Lantern',
  ingredients: [
    { itemId: 'rime_crystal', count: 1 },
    { itemId: 'iron_bar', count: 1 },
    { itemId: 'glacial_ice_block', count: 2 },
  ],
  createResult: () => new FrostLanternBlockItem(),
  resultCount: 2,
}

export const cocytusHandRecipes: IRecipe[] = [polishedIceRecipe, frostLanternRecipe]
