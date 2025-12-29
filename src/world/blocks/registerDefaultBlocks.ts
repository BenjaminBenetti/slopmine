import { registerBlock } from './BlockRegistry.ts'
import { StoneBlock, STONE_BLOCK_ID } from './types/StoneBlock.ts'
import { DirtBlock, DIRT_BLOCK_ID } from './types/DirtBlock.ts'
import { GrassBlock, GRASS_BLOCK_ID } from './types/GrassBlock.ts'

/**
 * Register all default block types.
 * Call this during game initialization.
 */
export function registerDefaultBlocks(): void {
  registerBlock({
    properties: {
      id: STONE_BLOCK_ID,
      name: 'stone',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 1.5,
      lightLevel: 0,
      lightBlocking: 15,
    },
    factory: () => new StoneBlock(),
  })

  registerBlock({
    properties: {
      id: DIRT_BLOCK_ID,
      name: 'dirt',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 0.5,
      lightLevel: 0,
      lightBlocking: 15,
    },
    factory: () => new DirtBlock(),
  })

  registerBlock({
    properties: {
      id: GRASS_BLOCK_ID,
      name: 'grass',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 0.6,
      lightLevel: 0,
      lightBlocking: 15,
    },
    factory: () => new GrassBlock(),
  })
}
