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
import { WaterSevenEighthBlock } from './types/water_seven_eighth/WaterSevenEighthBlock.ts'
import { WaterThreeQuarterBlock } from './types/water_three_quarter/WaterThreeQuarterBlock.ts'
import { WaterFiveEighthBlock } from './types/water_five_eighth/WaterFiveEighthBlock.ts'
import { WaterHalfBlock } from './types/water_half/WaterHalfBlock.ts'
import { WaterThreeEighthBlock } from './types/water_three_eighth/WaterThreeEighthBlock.ts'
import { WaterQuarterBlock } from './types/water_quarter/WaterQuarterBlock.ts'
import { WaterEighthBlock } from './types/water_eighth/WaterEighthBlock.ts'
import { LavaBlock } from './types/lava/LavaBlock.ts'
import { LavaSevenEighthBlock } from './types/lava_seven_eighth/LavaSevenEighthBlock.ts'
import { LavaThreeQuarterBlock } from './types/lava_three_quarter/LavaThreeQuarterBlock.ts'
import { LavaFiveEighthBlock } from './types/lava_five_eighth/LavaFiveEighthBlock.ts'
import { LavaHalfBlock } from './types/lava_half/LavaHalfBlock.ts'
import { LavaThreeEighthBlock } from './types/lava_three_eighth/LavaThreeEighthBlock.ts'
import { LavaQuarterBlock } from './types/lava_quarter/LavaQuarterBlock.ts'
import { LavaEighthBlock } from './types/lava_eighth/LavaEighthBlock.ts'

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

  registerBlock({
    properties: {
      id: BlockIds.WATER_EIGHTH,
      name: 'water_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new WaterEighthBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER_SEVEN_EIGHTH,
      name: 'water_seven_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 2,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new WaterSevenEighthBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER_FIVE_EIGHTH,
      name: 'water_five_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 1,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new WaterFiveEighthBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.WATER_THREE_EIGHTH,
      name: 'water_three_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 0,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new WaterThreeEighthBlock(),
  })

  // Lava blocks
  registerBlock({
    properties: {
      id: BlockIds.LAVA,
      name: 'lava',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 15,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [BlockTags.LIQUID_SOURCE],
    },
    factory: () => new LavaBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_SEVEN_EIGHTH,
      name: 'lava_seven_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 15,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaSevenEighthBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_THREE_QUARTER,
      name: 'lava_three_quarter',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 14,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaThreeQuarterBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_FIVE_EIGHTH,
      name: 'lava_five_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 13,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaFiveEighthBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_HALF,
      name: 'lava_half',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 12,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaHalfBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_THREE_EIGHTH,
      name: 'lava_three_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 11,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaThreeEighthBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_QUARTER,
      name: 'lava_quarter',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 10,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaQuarterBlock(),
  })

  registerBlock({
    properties: {
      id: BlockIds.LAVA_EIGHTH,
      name: 'lava_eighth',
      isOpaque: false,
      isSolid: false,
      isLiquid: true,
      hardness: 100,
      lightLevel: 8,
      lightBlocking: 0,
      demolitionForceRequired: Infinity,
      tags: [],
    },
    factory: () => new LavaEighthBlock(),
  })
}
