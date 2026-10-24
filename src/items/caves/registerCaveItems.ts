import type { IItem } from '../Item.ts'
import { PlantBlockItem } from '../blocks/plants/PlantBlockItem.ts'
import { CAVE_SOLID_ITEMS } from '../../world/blocks/types/cave_shared/caveSolidBlocks.ts'
import { CAVE_PLANT_ITEMS } from '../../world/blocks/types/cave_plants/cavePlantBlocks.ts'
import { SpiderSilkItem } from '../materials/spider_silk/SpiderSilkItem.ts'
import { CelestiteShardItem } from '../materials/celestite_shard/CelestiteShardItem.ts'
import { SalamanderScaleItem } from '../materials/salamander_scale/SalamanderScaleItem.ts'
import { GlowberriesItem } from '../food/glowberries/GlowberriesItem.ts'

/**
 * Register the Caves and Dark Places items with the persistence item
 * registry (the registrar is ItemRegistry's registerItemFactory, passed in
 * to keep this module free of a circular import): a block item per cave
 * block and cave plant that drops itself, and the cave materials and food.
 */
export function registerCaveItems(register: (id: string, factory: () => IItem) => void): void {
  for (const [blockName, label] of [...CAVE_SOLID_ITEMS, ...CAVE_PLANT_ITEMS]) {
    register(`${blockName}_block`, () => new PlantBlockItem(blockName, label))
  }
  register('spider_silk', () => new SpiderSilkItem())
  register('celestite_shard', () => new CelestiteShardItem())
  register('salamander_scale', () => new SalamanderScaleItem())
  register('glowberries', () => new GlowberriesItem())
}
