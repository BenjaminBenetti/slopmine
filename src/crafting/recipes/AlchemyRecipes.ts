import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import type { IRecipe } from '../RecipeRegistry.ts'
import { FireResistancePotionItem } from '../../items/potions/fire_resistance_potion/FireResistancePotionItem.ts'
import { LongFireResistancePotionItem } from '../../items/potions/fire_resistance_potion/LongFireResistancePotionItem.ts'
import { SlowFallingPotionItem } from '../../items/potions/slow_falling_potion/SlowFallingPotionItem.ts'
import { RegenerationPotionItem } from '../../items/potions/regeneration_potion/RegenerationPotionItem.ts'
import { EmberSightPotionItem } from '../../items/potions/ember_sight_potion/EmberSightPotionItem.ts'
import { LongEmberSightPotionItem } from '../../items/potions/ember_sight_potion/LongEmberSightPotionItem.ts'
import { StrengthPotionItem } from '../../items/potions/strength_potion/StrengthPotionItem.ts'
import { IceskinPotionItem } from '../../items/potions/iceskin_potion/IceskinPotionItem.ts'
import { ReturnIdolItem } from '../../items/magic/return_idol/ReturnIdolItem.ts'

/**
 * Hell alchemy: every Hell biome's resource brews a potion at the apothecary
 * (herb + the ingredient), so each biome is worth a visit. Slow falling also
 * has a surface recipe - cattail fluff drifts on the wind - because the first
 * drop into Hell happens before any Hell ingredient exists. Corrupted essence
 * stretches the two long-haul potions (fire resistance, ember sight).
 */
export const alchemyBrewingRecipes: IBrewingRecipe[] = [
  {
    id: 'brew_fire_resistance_potion',
    name: 'Fire Resistance Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'magma_cream', count: 1 },
    ],
    createResult: () => new FireResistancePotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_slow_falling_potion',
    name: 'Slow Falling Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'ember_roach_wing', count: 1 },
    ],
    createResult: () => new SlowFallingPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    // Surface route: cattails grow on jungle and swamp water banks
    id: 'brew_slow_falling_potion_cattail',
    name: 'Slow Falling Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'cattail_block', count: 2 },
    ],
    createResult: () => new SlowFallingPotionItem(),
    resultCount: 1,
    brewTime: 15,
  },
  {
    id: 'brew_regeneration_potion',
    name: 'Regeneration Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'ectoplasm', count: 1 },
    ],
    createResult: () => new RegenerationPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_ember_sight_potion',
    name: 'Ember Sight Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'glowcap', count: 1 },
    ],
    createResult: () => new EmberSightPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_strength_potion',
    name: 'Strength Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'prism_shard', count: 1 },
    ],
    createResult: () => new StrengthPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_iceskin_potion',
    name: 'Iceskin Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'rime_crystal', count: 1 },
    ],
    createResult: () => new IceskinPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_fire_resistance_potion_long',
    name: 'Long Fire Resistance Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'magma_cream', count: 1 },
      { itemId: 'corrupted_essence', count: 1 },
    ],
    createResult: () => new LongFireResistancePotionItem(),
    resultCount: 1,
    brewTime: 30,
  },
  {
    id: 'brew_ember_sight_potion_long',
    name: 'Long Ember Sight Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'glowcap', count: 1 },
      { itemId: 'corrupted_essence', count: 1 },
    ],
    createResult: () => new LongEmberSightPotionItem(),
    resultCount: 1,
    brewTime: 30,
  },
]

/**
 * Return Idol (hand crafted): gold and obsidian bound with corrupted essence -
 * craftable once the player has mined corrupted hell rock on a first trip down.
 */
export const alchemyHandRecipes: IRecipe[] = [
  {
    id: 'return_idol',
    name: 'Return Idol',
    ingredients: [
      { itemId: 'gold_bar', count: 2 },
      { itemId: 'corrupted_essence', count: 2 },
      { itemId: 'obsidian_block', count: 1 },
    ],
    createResult: () => new ReturnIdolItem(),
    resultCount: 1,
  },
]
