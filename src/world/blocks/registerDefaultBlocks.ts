import { registerBlock } from './BlockRegistry.ts'
import { BlockIds } from './BlockIds.ts'
import { BlockTags } from './tags/BlockTags.ts'
import { StoneBlock } from './types/stone/StoneBlock.ts'
import { DirtBlock } from './types/dirt/DirtBlock.ts'
import { GrassBlock } from './types/grass/GrassBlock.ts'
import { OakLogBlock } from './types/oak_log/OakLogBlock.ts'
import { OakLeavesBlock } from './types/oak_leaves/OakLeavesBlock.ts'
import { IronBlockBlock } from './types/iron_block/IronBlockBlock.ts'
import { CopperBlockBlock } from './types/copper_block/CopperBlockBlock.ts'
import { CoalBlockBlock } from './types/coal_block/CoalBlockBlock.ts'
import { GoldBlockBlock } from './types/gold_block/GoldBlockBlock.ts'
import { DiamondBlockBlock } from './types/diamond_block/DiamondBlockBlock.ts'
import { TorchBlock } from './types/torch/TorchBlock.ts'
import { ForgeBlock } from './types/forge/ForgeBlock.ts'
import { WaterBlock } from './types/water/WaterBlock.ts'
import { WaterThreeQuarterBlock } from './types/water_three_quarter/WaterThreeQuarterBlock.ts'
import { WaterHalfBlock } from './types/water_half/WaterHalfBlock.ts'
import { WaterQuarterBlock } from './types/water_quarter/WaterQuarterBlock.ts'

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
      demolitionForceRequired: 1,
      tags: [BlockTags.STONE],
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
      demolitionForceRequired: 0,
      tags: [BlockTags.DIRT],
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
      demolitionForceRequired: 0,
      tags: [BlockTags.DIRT],
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
      demolitionForceRequired: 0,
      tags: [BlockTags.WOOD],
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
      demolitionForceRequired: 0,
      tags: [BlockTags.LEAVES],
    },
    factory: () => new OakLeavesBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.IRON_BLOCK,
      name: 'iron_block',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 5.0,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 1,
      tags: [BlockTags.METAL],
    },
    factory: () => new IronBlockBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.COPPER_BLOCK,
      name: 'copper_block',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 3.0,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 1,
      tags: [BlockTags.METAL],
    },
    factory: () => new CopperBlockBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.COAL_BLOCK,
      name: 'coal_block',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 5.0,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 1,
      tags: [BlockTags.STONE],
    },
    factory: () => new CoalBlockBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.GOLD_BLOCK,
      name: 'gold_block',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 3.0,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 1,
      tags: [BlockTags.METAL],
    },
    factory: () => new GoldBlockBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.DIAMOND_BLOCK,
      name: 'diamond_block',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 5.0,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 1,
      tags: [BlockTags.METAL],
    },
    factory: () => new DiamondBlockBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.TORCH,
      name: 'torch',
      isOpaque: false,
      isSolid: false, // No collision - players can walk through
      isLiquid: false,
      hardness: 0,
      lightLevel: 14,
      lightBlocking: 0,
      demolitionForceRequired: 0,
      tags: [],
    },
    factory: () => new TorchBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.FORGE,
      name: 'forge',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 3.5,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 1,
      tags: [BlockTags.STONE],
    },
    factory: () => new ForgeBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER,
      name: 'water',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 2,
      demolitionForceRequired: Infinity,
      tags: [BlockTags.LIQUID_SOURCE],
    },
    factory: () => new WaterBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER_THREE_QUARTER,
      name: 'water_three_quarter',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 2,
      demolitionForceRequired: Infinity,
      tags: [BlockTags.LIQUID_SOURCE],
    },
    factory: () => new WaterThreeQuarterBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER_HALF,
      name: 'water_half',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 1,
      demolitionForceRequired: Infinity,
      tags: [BlockTags.LIQUID_SOURCE],
    },
    factory: () => new WaterHalfBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER_QUARTER,
      name: 'water_quarter',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new WaterQuarterBlock(),
  })
}
