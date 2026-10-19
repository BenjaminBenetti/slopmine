import { registerBlock } from '../../BlockRegistry.ts'
import { createWildPlantBlocks } from '../wild_plants/wildPlantBlocks.ts'
import { createForageBushBlocks } from '../forage_shared/ForageBushBlock.ts'
import { createForageSproutBlocks } from '../forage_shared/ForageSproutBlock.ts'
import { createCropBlocks } from '../crops/cropBlocks.ts'
import { OakSaplingBlock } from '../oak_sapling/OakSaplingBlock.ts'
import { FarmlandBlock } from '../farmland/FarmlandBlock.ts'

/**
 * Register the Nature Update's blocks (ids 361-447): wild plants and ground
 * doodads, forage bushes and their seed-grown young stages, the oak sapling,
 * farmland and the farm crops.
 */
export function registerNatureBlocks(): void {
  for (const block of createWildPlantBlocks()) registerBlock(block)
  for (const block of createForageBushBlocks()) registerBlock(block)
  for (const block of createForageSproutBlocks()) registerBlock(block)
  registerBlock(new OakSaplingBlock())
  registerBlock(new FarmlandBlock(false))
  registerBlock(new FarmlandBlock(true))
  for (const block of createCropBlocks()) registerBlock(block)
}
