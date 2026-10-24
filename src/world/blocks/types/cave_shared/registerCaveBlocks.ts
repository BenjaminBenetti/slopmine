import { registerBlock } from '../../BlockRegistry.ts'
import { createCaveSolidBlocks } from './caveSolidBlocks.ts'
import { createCavePlantBlocks } from '../cave_plants/cavePlantBlocks.ts'

/**
 * Register the Caves and Dark Places blocks (ids 448-477): cave biome rock,
 * crystal and fungus blocks, the celestite lamp, and the cave foliage.
 */
export function registerCaveBlocks(): void {
  for (const block of createCaveSolidBlocks()) registerBlock(block)
  for (const block of createCavePlantBlocks()) registerBlock(block)
}
