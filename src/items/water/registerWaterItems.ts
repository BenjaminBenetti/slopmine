import type { IItem } from '../Item.ts'
import { FishFoodItem, FISH_FOOD_IDS } from './fish/FishFoodItem.ts'
import { GlowJellyItem } from './glow_jelly/GlowJellyItem.ts'
import { WaterBreathingPotionItem } from '../potions/water_breathing_potion/WaterBreathingPotionItem.ts'
import { SailboatItem } from './sailboat/SailboatItem.ts'
import { CanoeItem } from './canoe/CanoeItem.ts'
import { PlantBlockItem } from '../blocks/plants/PlantBlockItem.ts'

/**
 * Register the water update's items with the persistence item registry
 * (the registrar is ItemRegistry's registerItemFactory, passed in to keep
 * this module free of a circular import): every fish dish raw and cooked,
 * glow jelly, the water breathing potion, the sailboat and the canoe, kelp and
 * seagrass.
 */
export function registerWaterItems(register: (id: string, factory: () => IItem) => void): void {
  for (const id of FISH_FOOD_IDS) register(id, () => new FishFoodItem(id))
  register('glow_jelly', () => new GlowJellyItem())
  register('water_breathing_potion', () => new WaterBreathingPotionItem())
  register('sailboat', () => new SailboatItem())
  register('canoe', () => new CanoeItem())
  register('kelp_block', () => new PlantBlockItem('kelp', 'Kelp'))
  register('seagrass_block', () => new PlantBlockItem('seagrass', 'Seagrass'))
}
