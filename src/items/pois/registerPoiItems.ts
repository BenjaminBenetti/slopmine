import type { IItem } from '../Item.ts'
import { PlantBlockItem } from '../blocks/plants/PlantBlockItem.ts'
import { POI_SOLID_ITEMS } from '../../world/blocks/types/poi_shared/poiSolidBlocks.ts'
import { POI_DECOR_ITEMS } from '../../world/blocks/types/poi_shared/poiDecorBlocks.ts'
import { RuneShardItem } from '../materials/rune_shard/RuneShardItem.ts'
import { DelversCompassItem } from '../magic/delvers_compass/DelversCompassItem.ts'

/**
 * Register the underground points of interest's items with the persistence
 * item registry (the registrar is ItemRegistry's registerItemFactory, passed
 * in to keep this module free of a circular import): a block item per block
 * that drops itself, rune shards and the Delver's Compass.
 */
export function registerPoiItems(register: (id: string, factory: () => IItem) => void): void {
  for (const [blockName, label] of [...POI_SOLID_ITEMS, ...POI_DECOR_ITEMS]) {
    register(`${blockName}_block`, () => new PlantBlockItem(blockName, label))
  }
  register('rune_shard', () => new RuneShardItem())
  register('delvers_compass', () => new DelversCompassItem())
}
