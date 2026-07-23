import { registerBlock } from './BlockRegistry.ts'
// Carpentry blocks
import { OakPlanksBlock } from './types/oak_planks/OakPlanksBlock.ts'
import { PinePlanksBlock } from './types/pine_planks/PinePlanksBlock.ts'
import { RedwoodPlanksBlock } from './types/redwood_planks/RedwoodPlanksBlock.ts'
import { OakSlabBlock } from './types/oak_slab/OakSlabBlock.ts'
import { PineSlabBlock } from './types/pine_slab/PineSlabBlock.ts'
import { RedwoodSlabBlock } from './types/redwood_slab/RedwoodSlabBlock.ts'
import { OakStairsBlock } from './types/oak_stairs/OakStairsBlock.ts'
import { PineStairsBlock } from './types/pine_stairs/PineStairsBlock.ts'
import { RedwoodStairsBlock } from './types/redwood_stairs/RedwoodStairsBlock.ts'
import { OakFenceBlock } from './types/oak_fence/OakFenceBlock.ts'
import { PineFenceBlock } from './types/pine_fence/PineFenceBlock.ts'
import { RedwoodFenceBlock } from './types/redwood_fence/RedwoodFenceBlock.ts'
import { OakFenceGateBlock } from './types/oak_fence_gate/OakFenceGateBlock.ts'
import { OakFenceGateOpenBlock } from './types/oak_fence_gate/OakFenceGateOpenBlock.ts'
import { PineFenceGateBlock } from './types/pine_fence_gate/PineFenceGateBlock.ts'
import { PineFenceGateOpenBlock } from './types/pine_fence_gate/PineFenceGateOpenBlock.ts'
import { RedwoodFenceGateBlock } from './types/redwood_fence_gate/RedwoodFenceGateBlock.ts'
import { RedwoodFenceGateOpenBlock } from './types/redwood_fence_gate/RedwoodFenceGateOpenBlock.ts'
import { OakDoorBlock } from './types/oak_door/OakDoorBlock.ts'
import { OakDoorUpperBlock } from './types/oak_door_upper/OakDoorUpperBlock.ts'
import { OakDoorOpenBlock } from './types/oak_door_open/OakDoorOpenBlock.ts'
import { OakDoorUpperOpenBlock } from './types/oak_door_upper_open/OakDoorUpperOpenBlock.ts'
import { PineDoorBlock } from './types/pine_door/PineDoorBlock.ts'
import { PineDoorUpperBlock } from './types/pine_door_upper/PineDoorUpperBlock.ts'
import { PineDoorOpenBlock } from './types/pine_door_open/PineDoorOpenBlock.ts'
import { PineDoorUpperOpenBlock } from './types/pine_door_upper_open/PineDoorUpperOpenBlock.ts'
import { RedwoodDoorBlock } from './types/redwood_door/RedwoodDoorBlock.ts'
import { RedwoodDoorUpperBlock } from './types/redwood_door_upper/RedwoodDoorUpperBlock.ts'
import { RedwoodDoorOpenBlock } from './types/redwood_door_open/RedwoodDoorOpenBlock.ts'
import { RedwoodDoorUpperOpenBlock } from './types/redwood_door_upper_open/RedwoodDoorUpperOpenBlock.ts'
import { OakTrapdoorBlock } from './types/oak_trapdoor/OakTrapdoorBlock.ts'
import { OakTrapdoorOpenBlock } from './types/oak_trapdoor_open/OakTrapdoorOpenBlock.ts'
import { PineTrapdoorBlock } from './types/pine_trapdoor/PineTrapdoorBlock.ts'
import { PineTrapdoorOpenBlock } from './types/pine_trapdoor_open/PineTrapdoorOpenBlock.ts'
import { RedwoodTrapdoorBlock } from './types/redwood_trapdoor/RedwoodTrapdoorBlock.ts'
import { RedwoodTrapdoorOpenBlock } from './types/redwood_trapdoor_open/RedwoodTrapdoorOpenBlock.ts'
import { OakTableBlock } from './types/oak_table/OakTableBlock.ts'
import { PineTableBlock } from './types/pine_table/PineTableBlock.ts'
import { RedwoodTableBlock } from './types/redwood_table/RedwoodTableBlock.ts'
import { OakChairBlock } from './types/oak_chair/OakChairBlock.ts'
import { PineChairBlock } from './types/pine_chair/PineChairBlock.ts'
import { RedwoodChairBlock } from './types/redwood_chair/RedwoodChairBlock.ts'
import { OakShelfBlock } from './types/oak_shelf/OakShelfBlock.ts'
import { PineShelfBlock } from './types/pine_shelf/PineShelfBlock.ts'
import { RedwoodShelfBlock } from './types/redwood_shelf/RedwoodShelfBlock.ts'
import { OakWindowBlock } from './types/oak_window/OakWindowBlock.ts'
import { PineWindowBlock } from './types/pine_window/PineWindowBlock.ts'
import { RedwoodWindowBlock } from './types/redwood_window/RedwoodWindowBlock.ts'
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
import { WaterFallingBlock } from './types/water/WaterFallingBlock.ts'
import { LavaBlock } from './types/lava/LavaBlock.ts'
import { LavaSevenEighthBlock } from './types/lava_seven_eighth/LavaSevenEighthBlock.ts'
import { LavaThreeQuarterBlock } from './types/lava_three_quarter/LavaThreeQuarterBlock.ts'
import { LavaFiveEighthBlock } from './types/lava_five_eighth/LavaFiveEighthBlock.ts'
import { LavaHalfBlock } from './types/lava_half/LavaHalfBlock.ts'
import { LavaThreeEighthBlock } from './types/lava_three_eighth/LavaThreeEighthBlock.ts'
import { LavaQuarterBlock } from './types/lava_quarter/LavaQuarterBlock.ts'
import { LavaEighthBlock } from './types/lava_eighth/LavaEighthBlock.ts'
import { LavaFallingBlock } from './types/lava/LavaFallingBlock.ts'
import { SandBlock } from './types/sand/SandBlock.ts'
import { SandstoneBlock } from './types/sandstone/SandstoneBlock.ts'
import { CactusBlock } from './types/cactus/CactusBlock.ts'
import { VineBlock } from './types/vine/VineBlock.ts'
import { BasaltBlock } from './types/basalt/BasaltBlock.ts'
import { ColumnarBasaltBlock } from './types/columnar_basalt/ColumnarBasaltBlock.ts'
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
import { SwampWaterFallingBlock } from './types/swamp_water/SwampWaterFallingBlock.ts'
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
import { PineLogBlock } from './types/pine_log/PineLogBlock.ts'
import { PineNeedlesBlock } from './types/pine_needles/PineNeedlesBlock.ts'
import { PineSaplingBlock } from './types/pine_sapling/PineSaplingBlock.ts'
import { ResinTapBlock } from './types/resin_tap/ResinTapBlock.ts'
import { SnowyGrassBlock } from './types/snowy_grass/SnowyGrassBlock.ts'
import { SnowyPineNeedlesBlock } from './types/snowy_pine_needles/SnowyPineNeedlesBlock.ts'
import { PineconeBlock } from './types/pinecone/PineconeBlock.ts'
import { BerryBushBlock } from './types/berry_bush/BerryBushBlock.ts'
import { BerryBushLadenBlock } from './types/berry_bush_berries/BerryBushLadenBlock.ts'
import { MorelMushroomBlock } from './types/morel_mushroom/MorelMushroomBlock.ts'
import { CampfireBlock } from './types/campfire/CampfireBlock.ts'
import { CattailBlock } from './types/cattail/CattailBlock.ts'
import { CattailTopBlock } from './types/cattail_top/CattailTopBlock.ts'
import { ObsidianBlock } from './types/obsidian/ObsidianBlock.ts'
import { SulfurOreBlock } from './types/sulfur_ore/SulfurOreBlock.ts'
import { GeyserBlock } from './types/geyser/GeyserBlock.ts'
import { GeyserActiveBlock } from './types/geyser_active/GeyserActiveBlock.ts'
import { SmolderingStoneBlock } from './types/smoldering_stone/SmolderingStoneBlock.ts'
import { CharredLogBlock } from './types/charred_log/CharredLogBlock.ts'
import { TntBlock } from './types/tnt/TntBlock.ts'
import { FallenPineLogXBlock } from './types/fallen_pine_log_x/FallenPineLogXBlock.ts'
import { FallenPineLogZBlock } from './types/fallen_pine_log_z/FallenPineLogZBlock.ts'
import { PineStumpBlock } from './types/pine_stump/PineStumpBlock.ts'
import { PodzolBlock } from './types/podzol/PodzolBlock.ts'
import { RedwoodLogBlock } from './types/redwood_log/RedwoodLogBlock.ts'
import { RedwoodLeavesBlock } from './types/redwood_leaves/RedwoodLeavesBlock.ts'
import { MossBlock } from './types/moss/MossBlock.ts'
import { MossyStoneBlock } from './types/mossy_stone/MossyStoneBlock.ts'
import { CoastalFernBlock } from './types/coastal_fern/CoastalFernBlock.ts'
import { CoastalFernTopBlock } from './types/coastal_fern_top/CoastalFernTopBlock.ts'
import { SeaShellBlock } from './types/sea_shell/SeaShellBlock.ts'
import { CrabShellBlock } from './types/crab_shell/CrabShellBlock.ts'
import { SeaStarBlock } from './types/sea_star/SeaStarBlock.ts'
import { ResinTorchBlock } from './types/resin_torch/ResinTorchBlock.ts'

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
  registerBlock(new WaterFallingBlock())

  // Lava blocks
  registerBlock(new LavaBlock())
  registerBlock(new LavaSevenEighthBlock())
  registerBlock(new LavaThreeQuarterBlock())
  registerBlock(new LavaFiveEighthBlock())
  registerBlock(new LavaHalfBlock())
  registerBlock(new LavaThreeEighthBlock())
  registerBlock(new LavaQuarterBlock())
  registerBlock(new LavaEighthBlock())
  registerBlock(new LavaFallingBlock())

  // Desert biome blocks
  registerBlock(new SandBlock())
  registerBlock(new SandstoneBlock())
  registerBlock(new CactusBlock())

  // Jungle biome blocks
  registerBlock(new VineBlock())

  // Volcanic biome blocks
  registerBlock(new BasaltBlock())
  registerBlock(new ColumnarBasaltBlock())
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
  registerBlock(new SwampWaterFallingBlock())

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

  // Pine forest biome blocks
  registerBlock(new PineLogBlock())
  registerBlock(new PineNeedlesBlock())
  registerBlock(new PineSaplingBlock())
  registerBlock(new ResinTapBlock())
  registerBlock(new SnowyGrassBlock())
  registerBlock(new SnowyPineNeedlesBlock())
  registerBlock(new PineconeBlock())
  registerBlock(new BerryBushBlock())
  registerBlock(new BerryBushLadenBlock())
  registerBlock(new MorelMushroomBlock())
  registerBlock(new CampfireBlock())
  registerBlock(new CattailBlock())
  registerBlock(new CattailTopBlock())
  registerBlock(new ObsidianBlock())
  registerBlock(new SulfurOreBlock())
  registerBlock(new GeyserBlock())
  registerBlock(new GeyserActiveBlock())
  registerBlock(new SmolderingStoneBlock())
  registerBlock(new CharredLogBlock())
  registerBlock(new TntBlock())
  registerBlock(new FallenPineLogXBlock())
  registerBlock(new FallenPineLogZBlock())
  registerBlock(new PineStumpBlock())
  registerBlock(new PodzolBlock())

  // Coastal rain forest biome blocks
  registerBlock(new RedwoodLogBlock())
  registerBlock(new RedwoodLeavesBlock())
  registerBlock(new MossBlock())
  registerBlock(new MossyStoneBlock())
  registerBlock(new CoastalFernBlock())
  registerBlock(new CoastalFernTopBlock())

  // Beach decoration blocks
  registerBlock(new SeaShellBlock())
  registerBlock(new CrabShellBlock())
  registerBlock(new SeaStarBlock())

  // Upgraded light sources
  registerBlock(new ResinTorchBlock())

  // Carpentry blocks
  registerBlock(new OakPlanksBlock())
  registerBlock(new PinePlanksBlock())
  registerBlock(new RedwoodPlanksBlock())
  registerBlock(new OakSlabBlock())
  registerBlock(new PineSlabBlock())
  registerBlock(new RedwoodSlabBlock())
  registerBlock(new OakStairsBlock())
  registerBlock(new PineStairsBlock())
  registerBlock(new RedwoodStairsBlock())
  registerBlock(new OakFenceBlock())
  registerBlock(new PineFenceBlock())
  registerBlock(new RedwoodFenceBlock())
  registerBlock(new OakFenceGateBlock())
  registerBlock(new OakFenceGateOpenBlock())
  registerBlock(new PineFenceGateBlock())
  registerBlock(new PineFenceGateOpenBlock())
  registerBlock(new RedwoodFenceGateBlock())
  registerBlock(new RedwoodFenceGateOpenBlock())
  registerBlock(new OakDoorBlock())
  registerBlock(new OakDoorUpperBlock())
  registerBlock(new OakDoorOpenBlock())
  registerBlock(new OakDoorUpperOpenBlock())
  registerBlock(new PineDoorBlock())
  registerBlock(new PineDoorUpperBlock())
  registerBlock(new PineDoorOpenBlock())
  registerBlock(new PineDoorUpperOpenBlock())
  registerBlock(new RedwoodDoorBlock())
  registerBlock(new RedwoodDoorUpperBlock())
  registerBlock(new RedwoodDoorOpenBlock())
  registerBlock(new RedwoodDoorUpperOpenBlock())
  registerBlock(new OakTrapdoorBlock())
  registerBlock(new OakTrapdoorOpenBlock())
  registerBlock(new PineTrapdoorBlock())
  registerBlock(new PineTrapdoorOpenBlock())
  registerBlock(new RedwoodTrapdoorBlock())
  registerBlock(new RedwoodTrapdoorOpenBlock())
  registerBlock(new OakTableBlock())
  registerBlock(new PineTableBlock())
  registerBlock(new RedwoodTableBlock())
  registerBlock(new OakChairBlock())
  registerBlock(new PineChairBlock())
  registerBlock(new RedwoodChairBlock())
  registerBlock(new OakShelfBlock())
  registerBlock(new PineShelfBlock())
  registerBlock(new RedwoodShelfBlock())
  registerBlock(new OakWindowBlock())
  registerBlock(new PineWindowBlock())
  registerBlock(new RedwoodWindowBlock())
}
