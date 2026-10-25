import type { IRecipe } from '../RecipeRegistry.ts'
import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import type { IBrewingRecipe } from '../../brewing/interfaces/IBrewingRecipe.ts'
import { PlantBlockItem } from '../../items/blocks/plants/PlantBlockItem.ts'
import { GlassBlockItem } from '../../items/blocks/glass/GlassBlockItem.ts'
import { StormGlassItem } from '../../items/weather/storm_glass/StormGlassItem.ts'
import { SkyBellItem } from '../../items/weather/sky_bell/SkyBellItem.ts'
import { SwiftnessPotionItem } from '../../items/potions/swiftness_potion/SwiftnessPotionItem.ts'
import { EmberSightPotionItem } from '../../items/potions/ember_sight_potion/EmberSightPotionItem.ts'

const block = (name: string, label: string) => () => new PlantBlockItem(name, label)

/**
 * The weather: a copper lightning rod to keep storms off a base, a
 * weathervane, the Storm Glass (a real one holds camphor - here a herb), the
 * Sky Bell forged around a Thunderhead's storm essence and lightning's
 * fulgurite, and a lantern of fallen stardust.
 */
export const weatherHandRecipes: IRecipe[] = [
  {
    id: 'lightning_rod',
    name: 'Lightning Rod',
    ingredients: [{ itemId: 'copper_bar', count: 3 }],
    createResult: block('lightning_rod', 'Lightning Rod'),
    resultCount: 1,
  },
  {
    id: 'weathervane',
    name: 'Weathervane',
    ingredients: [{ itemId: 'copper_bar', count: 2 }, { itemId: 'iron_bar', count: 1 }, { itemId: 'stick', count: 1 }],
    createResult: block('weathervane', 'Weathervane'),
    resultCount: 1,
  },
  {
    id: 'storm_glass',
    name: 'Storm Glass',
    ingredients: [{ itemId: 'glass_block', count: 3 }, { itemId: 'copper_bar', count: 1 }, { itemId: 'herb', count: 1 }],
    createResult: () => new StormGlassItem(),
    resultCount: 1,
  },
  {
    id: 'sky_bell',
    name: 'Sky Bell',
    ingredients: [{ itemId: 'gold_bar', count: 2 }, { itemId: 'storm_essence', count: 1 }, { itemId: 'fulgurite', count: 1 }],
    createResult: () => new SkyBellItem(),
    resultCount: 1,
  },
  {
    id: 'star_lantern',
    name: 'Star Lantern',
    ingredients: [{ itemId: 'stardust', count: 4 }, { itemId: 'glass_block', count: 1 }, { itemId: 'iron_bar', count: 1 }],
    createResult: block('star_lantern', 'Star Lantern'),
    resultCount: 1,
  },
]

/** Fulgurite melts back into glass. */
export const weatherSmeltingRecipes: ISmeltingRecipe[] = [
  {
    id: 'melt_fulgurite',
    name: 'Glass',
    inputId: 'fulgurite',
    createResult: () => new GlassBlockItem(),
    resultCount: 2,
    smeltTime: 10,
  },
]

/** Weather creatures' drops at the apothecary: a Dune Dervish's whirlstone quickens, a Marsh Wisp's light sharpens the eyes. */
export const weatherBrewingRecipes: IBrewingRecipe[] = [
  {
    id: 'brew_swiftness_potion',
    name: 'Swiftness Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'whirlstone', count: 1 },
    ],
    createResult: () => new SwiftnessPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
  {
    id: 'brew_ember_sight_potion_wisp_light',
    name: 'Ember Sight Potion',
    ingredients: [
      { itemId: 'herb', count: 1 },
      { itemId: 'wisp_light', count: 1 },
    ],
    createResult: () => new EmberSightPotionItem(),
    resultCount: 1,
    brewTime: 20,
  },
]
