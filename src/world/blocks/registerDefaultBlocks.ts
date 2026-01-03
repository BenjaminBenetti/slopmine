import { registerBlock } from './BlockRegistry.ts'
import { BlockIds } from './BlockIds.ts'
import { StoneBlock } from './types/stone/StoneBlock.ts'
import { DirtBlock } from './types/dirt/DirtBlock.ts'
import { GrassBlock } from './types/grass/GrassBlock.ts'
import { OakLogBlock } from './types/oak_log/OakLogBlock.ts'
import { OakLeavesBlock } from './types/oak_leaves/OakLeavesBlock.ts'
import { RedFlowerBlock } from './types/red_flower/RedFlowerBlock.ts'
import { YellowFlowerBlock } from './types/yellow_flower/YellowFlowerBlock.ts'
import { BlueFlowerBlock } from './types/blue_flower/BlueFlowerBlock.ts'
import { PinkFlowerBlock } from './types/pink_flower/PinkFlowerBlock.ts'

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

  registerBlock({
    properties: {
      id: BlockIds.OAK_LOG,
      name: 'oak_log',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 2.0,
      lightLevel: 0,
      lightBlocking: 15,
    },
    factory: () => new OakLogBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.OAK_LEAVES,
      name: 'oak_leaves',
      isOpaque: false,
      isSolid: true,
      isLiquid: false,
      hardness: 0.2,
      lightLevel: 0,
      lightBlocking: 1,
    },
    factory: () => new OakLeavesBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.RED_FLOWER,
      name: 'red_flower',
      isOpaque: false,
      isSolid: false,
      isLiquid: false,
      hardness: 0.0,
      lightLevel: 0,
      lightBlocking: 0,
    },
    factory: () => new RedFlowerBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.YELLOW_FLOWER,
      name: 'yellow_flower',
      isOpaque: false,
      isSolid: false,
      isLiquid: false,
      hardness: 0.0,
      lightLevel: 0,
      lightBlocking: 0,
    },
    factory: () => new YellowFlowerBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.BLUE_FLOWER,
      name: 'blue_flower',
      isOpaque: false,
      isSolid: false,
      isLiquid: false,
      hardness: 0.0,
      lightLevel: 0,
      lightBlocking: 0,
    },
    factory: () => new BlueFlowerBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.PINK_FLOWER,
      name: 'pink_flower',
      isOpaque: false,
      isSolid: false,
      isLiquid: false,
      hardness: 0.0,
      lightLevel: 0,
      lightBlocking: 0,
    },
    factory: () => new PinkFlowerBlock(),
  })
}
