import { registerBlock } from './BlockRegistry.ts'
import { BlockIds } from './BlockIds.ts'
import { StoneBlock } from './types/stone/StoneBlock.ts'
import { DirtBlock } from './types/dirt/DirtBlock.ts'
import { GrassBlock } from './types/grass/GrassBlock.ts'

/**
 * Register all default block types.
 * Call this during game initialization.
 */
export function registerDefaultBlocks(): void {
  registerBlock({
    properties: {
      id: BlockIds.STONE,
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
      id: BlockIds.DIRT,
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
      id: BlockIds.GRASS,
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
