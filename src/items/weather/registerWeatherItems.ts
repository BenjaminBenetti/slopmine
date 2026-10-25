import type { IItem } from '../Item.ts'
import { PlantBlockItem } from '../blocks/plants/PlantBlockItem.ts'
import { StormGlassItem } from './storm_glass/StormGlassItem.ts'
import { SkyBellItem } from './sky_bell/SkyBellItem.ts'
import { StardustItem } from './stardust/StardustItem.ts'
import { FulguriteItem } from './fulgurite/FulguriteItem.ts'
import { StormEssenceItem } from './storm_essence/StormEssenceItem.ts'
import { WhirlstoneItem } from './whirlstone/WhirlstoneItem.ts'
import { WhiteoutPeltItem } from './whiteout_pelt/WhiteoutPeltItem.ts'
import { WispLightItem } from './wisp_light/WispLightItem.ts'
import { SwiftnessPotionItem } from '../potions/swiftness_potion/SwiftnessPotionItem.ts'

/** The weather update's blocks that drop themselves (each gets a block item). */
export const WEATHER_BLOCK_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['lightning_rod', 'Lightning Rod'],
  ['weathervane', 'Weathervane'],
  ['star_lantern', 'Star Lantern'],
]

/**
 * Register the weather update's items with the persistence item registry
 * (the registrar is ItemRegistry's registerItemFactory, passed in to keep
 * this module free of a circular import): the lightning rod, weathervane and
 * star lantern block items, the Storm Glass and Sky Bell, the weather
 * creatures' drops, stardust, fulgurite and the swiftness potion.
 */
export function registerWeatherItems(register: (id: string, factory: () => IItem) => void): void {
  for (const [blockName, label] of WEATHER_BLOCK_ITEMS) {
    register(`${blockName}_block`, () => new PlantBlockItem(blockName, label))
  }
  register('storm_glass', () => new StormGlassItem())
  register('sky_bell', () => new SkyBellItem())
  register('stardust', () => new StardustItem())
  register('fulgurite', () => new FulguriteItem())
  register('storm_essence', () => new StormEssenceItem())
  register('whirlstone', () => new WhirlstoneItem())
  register('whiteout_pelt', () => new WhiteoutPeltItem())
  register('wisp_light', () => new WispLightItem())
  register('swiftness_potion', () => new SwiftnessPotionItem())
}
