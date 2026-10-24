import { registerBlock } from '../../BlockRegistry.ts'
import { createPoiSolidBlocks } from './poiSolidBlocks.ts'
import { createPoiDecorBlocks } from './poiDecorBlocks.ts'
import { PoiKeystoneBlock } from '../poi_keystone/PoiKeystoneBlock.ts'

/**
 * Register the underground points of interest's blocks (ids 482-511): the
 * ancient masonry, runestone, bookshelves, petrified wood, heaped gold,
 * fossil bone, barrels and sandstone masonry, the decorations (iron bars
 * among them), and the keystone that marks each point of interest.
 */
export function registerPoiBlocks(): void {
  for (const block of createPoiSolidBlocks()) registerBlock(block)
  for (const block of createPoiDecorBlocks()) registerBlock(block)
  registerBlock(new PoiKeystoneBlock())
}
