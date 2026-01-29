import { registerBlock } from './BlockRegistry.ts'
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
import { SandBlock } from './types/sand/SandBlock.ts'
import { SandstoneBlock } from './types/sandstone/SandstoneBlock.ts'
import { CactusBlock } from './types/cactus/CactusBlock.ts'
import { VineBlock } from './types/vine/VineBlock.ts'
import { BasaltBlock } from './types/basalt/BasaltBlock.ts'
import { MagmaBlock } from './types/magma/MagmaBlock.ts'
import { MudBlock } from './types/mud/MudBlock.ts'
import { ClayBlock } from './types/clay/ClayBlock.ts'
import { MushroomBlock } from './types/mushroom/MushroomBlock.ts'
import { MushroomCapBlock } from './types/mushroom-cap/MushroomCapBlock.ts'
import { SwampWaterBlock } from './types/swamp_water/SwampWaterBlock.ts'
import { SwampWaterSevenEighthBlock } from './types/swamp_water_seven_eighth/SwampWaterSevenEighthBlock.ts'
import { SwampWaterThreeQuarterBlock } from './types/swamp_water_three_quarter/SwampWaterThreeQuarterBlock.ts'
import { SwampWaterFiveEighthBlock } from './types/swamp_water_five_eighth/SwampWaterFiveEighthBlock.ts'
import { SwampWaterHalfBlock } from './types/swamp_water_half/SwampWaterHalfBlock.ts'
import { SwampWaterThreeEighthBlock } from './types/swamp_water_three_eighth/SwampWaterThreeEighthBlock.ts'
import { SwampWaterQuarterBlock } from './types/swamp_water_quarter/SwampWaterQuarterBlock.ts'
import { SwampWaterEighthBlock } from './types/swamp_water_eighth/SwampWaterEighthBlock.ts'
import { MuddyGrassBlock } from './types/muddy_grass/MuddyGrassBlock.ts'
import { BlueMushroomBlock } from './types/blue_mushroom/BlueMushroomBlock.ts'
import { BlueMushroomCapBlock } from './types/blue_mushroom_cap/BlueMushroomCapBlock.ts'
import { PurpleMushroomBlock } from './types/purple_mushroom/PurpleMushroomBlock.ts'
import { PurpleMushroomCapBlock } from './types/purple_mushroom_cap/PurpleMushroomCapBlock.ts'
import { Wheat1Block } from './types/wheat/Wheat1Block.ts'
import { Wheat2Block } from './types/wheat/Wheat2Block.ts'
import { Wheat3Block } from './types/wheat/Wheat3Block.ts'
import { Herb1Block } from './types/herb/Herb1Block.ts'
import { Herb2Block } from './types/herb/Herb2Block.ts'
import { Herb3Block } from './types/herb/Herb3Block.ts'
import { HellRockBlock } from './types/hell_rock/HellRockBlock.ts'
import { HellMagmaBlock } from './types/hell_magma/HellMagmaBlock.ts'
import { CorruptedHellRockBlock } from './types/corrupted_hell_rock/CorruptedHellRockBlock.ts'
import { GlassBlock } from './types/glass/GlassBlock.ts'
import { ApothecaryWorkbenchBlock } from './types/apothecary_workbench/ApothecaryWorkbenchBlock.ts'
import { WoodworkingBenchBlock } from './types/woodworking_bench/WoodworkingBenchBlock.ts'
import { YellowFlowerBlock } from './types/yellow_flower/YellowFlowerBlock.ts'
import { BlueFlowerBlock } from './types/blue_flower/BlueFlowerBlock.ts'
import { RedFlowerBlock } from './types/red_flower/RedFlowerBlock.ts'
import { JungleFernBlock } from './types/jungle_fern/JungleFernBlock.ts'
import { LadderBlock } from './types/ladder/LadderBlock.ts'
import { Hemp1Block } from './types/hemp/Hemp1Block.ts'
import { Hemp2Block } from './types/hemp/Hemp2Block.ts'
import { Hemp3Block } from './types/hemp/Hemp3Block.ts'
import { BedHeadBlock } from './types/bed_head/BedHeadBlock.ts'
import { BedFootBlock } from './types/bed_foot/BedFootBlock.ts'
import { RopeLadderBlock } from './types/rope_ladder/RopeLadderBlock.ts'
import { DiviningStickBlock } from './types/divining_stick/DiviningStickBlock.ts'
import { ChestBlock } from './types/chest/ChestBlock.ts'

/**
 * Register all default block types.
 * Block properties are defined in each block class file (single source of truth).
 */
export function registerDefaultBlocks(): void {
  // Core blocks
  registerBlock(new StoneBlock())
  registerBlock(new DirtBlock())
  registerBlock(new GrassBlock())
  registerBlock(new OakLogBlock())
  registerBlock(new OakLeavesBlock())

  // Ore blocks
  registerBlock(new CoalBlockBlock())
  registerBlock(new IronBlockBlock())
  registerBlock(new CopperBlockBlock())
  registerBlock(new GoldBlockBlock())
  registerBlock(new DiamondBlockBlock())

  // Utility blocks
  registerBlock(new TorchBlock())
  registerBlock(new ForgeBlock())
  registerBlock(new ApothecaryWorkbenchBlock())
  registerBlock(new WoodworkingBenchBlock())
  registerBlock(new DiviningStickBlock())
  registerBlock(new ChestBlock())

  // Water blocks
  registerBlock(new WaterBlock())
  registerBlock(new WaterSevenEighthBlock())
  registerBlock(new WaterThreeQuarterBlock())
  registerBlock(new WaterFiveEighthBlock())
  registerBlock(new WaterHalfBlock())
  registerBlock(new WaterThreeEighthBlock())
  registerBlock(new WaterQuarterBlock())
  registerBlock(new WaterEighthBlock())

  // Lava blocks
  registerBlock(new LavaBlock())
  registerBlock(new LavaSevenEighthBlock())
  registerBlock(new LavaThreeQuarterBlock())
  registerBlock(new LavaFiveEighthBlock())
  registerBlock(new LavaHalfBlock())
  registerBlock(new LavaThreeEighthBlock())
  registerBlock(new LavaQuarterBlock())
  registerBlock(new LavaEighthBlock())

  // Desert biome blocks
  registerBlock(new SandBlock())
  registerBlock(new SandstoneBlock())
  registerBlock(new CactusBlock())

  // Jungle biome blocks
  registerBlock(new VineBlock())

  // Volcanic biome blocks
  registerBlock(new BasaltBlock())
  registerBlock(new MagmaBlock())

  // Swamp biome blocks
  registerBlock(new MudBlock())
  registerBlock(new ClayBlock())
  registerBlock(new MushroomBlock())
  registerBlock(new MushroomCapBlock())
  registerBlock(new MuddyGrassBlock())
  registerBlock(new BlueMushroomBlock())
  registerBlock(new BlueMushroomCapBlock())
  registerBlock(new PurpleMushroomBlock())
  registerBlock(new PurpleMushroomCapBlock())

  // Swamp water blocks
  registerBlock(new SwampWaterBlock())
  registerBlock(new SwampWaterSevenEighthBlock())
  registerBlock(new SwampWaterThreeQuarterBlock())
  registerBlock(new SwampWaterFiveEighthBlock())
  registerBlock(new SwampWaterHalfBlock())
  registerBlock(new SwampWaterThreeEighthBlock())
  registerBlock(new SwampWaterQuarterBlock())
  registerBlock(new SwampWaterEighthBlock())

  // Crop blocks
  registerBlock(new Wheat1Block())
  registerBlock(new Wheat2Block())
  registerBlock(new Wheat3Block())
  registerBlock(new Herb1Block())
  registerBlock(new Herb2Block())
  registerBlock(new Herb3Block())

  // Hell biome blocks
  registerBlock(new HellRockBlock())
  registerBlock(new HellMagmaBlock())
  registerBlock(new CorruptedHellRockBlock())

  // Transparent blocks
  registerBlock(new GlassBlock())

  // Flower blocks
  registerBlock(new YellowFlowerBlock())
  registerBlock(new BlueFlowerBlock())
  registerBlock(new RedFlowerBlock())

  // Jungle vegetation
  registerBlock(new JungleFernBlock())

  // Climbable blocks
  registerBlock(new LadderBlock())
  registerBlock(new RopeLadderBlock())

  // Hemp blocks
  registerBlock(new Hemp1Block())
  registerBlock(new Hemp2Block())
  registerBlock(new Hemp3Block())

  // Furniture blocks
  registerBlock(new BedHeadBlock())
  registerBlock(new BedFootBlock())
}
