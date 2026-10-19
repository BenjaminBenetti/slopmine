import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import type { IRecipe } from '../RecipeRegistry.ts'
import { WardLanternBlockItem } from '../../items/blocks/ward_lantern/WardLanternBlockItem.ts'
import { EmberSightPotionItem } from '../../items/potions/ember_sight_potion/EmberSightPotionItem.ts'
import { FireResistancePotionItem } from '../../items/potions/fire_resistance_potion/FireResistancePotionItem.ts'

/**
 * Ward Lantern (hand crafted): any two night trophies hung on an iron
 * lantern - no night creature rises within 32 blocks of one.
 */
export const wardLanternRecipe: IRecipe = {
  id: 'ward_lantern',
  name: 'Ward Lantern',
  ingredients: [
    { tag: 'night_trophy', count: 2 },
    { itemId: 'iron_bar', count: 1 },
    { itemId: 'torch_block', count: 1 },
  ],
  createResult: () => new WardLanternBlockItem(),
  resultCount: 1,
}

export const nightfallHandRecipes: IRecipe[] = [wardLanternRecipe]

/**
 * Surface routes to two Hell potions, for those who hunt at night: dusk-moth
 * dust sharpens the eyes in the dark (ember sight), an Ashwalker's cinder
 * core wards off fire (fire resistance).
 */
export const nightfallBrewingRecipes: IBrewingRecipe[] = [
  {
    id: 'brew_ember_sight_potion_moth',
    name: 'Ember Sight Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'moth_dust', count: 2 },
    ],
    createResult: () => new EmberSightPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_fire_resistance_potion_cinder',
    name: 'Fire Resistance Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'cinder_core', count: 1 },
    ],
    createResult: () => new FireResistancePotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
]
