import type { IRecipe } from '../RecipeRegistry.ts'
import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { PlantBlockItem } from '../../items/blocks/plants/PlantBlockItem.ts'
import { RopeItem } from '../../items/materials/rope/RopeItem.ts'
import { EmberSightPotionItem } from '../../items/potions/ember_sight_potion/EmberSightPotionItem.ts'
import { FireResistancePotionItem } from '../../items/potions/fire_resistance_potion/FireResistancePotionItem.ts'

/**
 * Caves and dark places: celestite lamps and blocks from the crystal
 * geodes' shards, rope from spider silk.
 */
export const caveHandRecipes: IRecipe[] = [
  {
    id: 'celestite_lamp',
    name: 'Celestite Lamp',
    ingredients: [{ itemId: 'celestite_shard', count: 4 }, { itemId: 'iron_bar', count: 1 }],
    createResult: () => new PlantBlockItem('celestite_lamp', 'Celestite Lamp'),
    resultCount: 2,
  },
  {
    id: 'celestite_block',
    name: 'Celestite',
    ingredients: [{ itemId: 'celestite_shard', count: 4 }],
    createResult: () => new PlantBlockItem('celestite_block', 'Celestite'),
    resultCount: 1,
  },
  {
    id: 'rope_from_silk',
    name: 'Rope',
    ingredients: [{ itemId: 'spider_silk', count: 2 }],
    createResult: () => new RopeItem(),
    resultCount: 1,
  },
]

/**
 * Cave routes to two potions: the fungal hollows' glowing cave mushrooms
 * sharpen the eyes in the dark (ember sight - the cave explorer's potion),
 * an ember salamander's scale wards off fire.
 */
export const caveBrewingRecipes: IBrewingRecipe[] = [
  {
    id: 'brew_ember_sight_potion_cave_mushrooms',
    name: 'Ember Sight Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'cave_mushrooms_block', count: 2 },
    ],
    createResult: () => new EmberSightPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_fire_resistance_potion_salamander',
    name: 'Fire Resistance Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'salamander_scale', count: 1 },
    ],
    createResult: () => new FireResistancePotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
]
