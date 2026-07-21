/**
 * Item factory registry for deserializing inventory items.
 * Maps item IDs to factory functions that create item instances.
 */

import type { IItem } from '../items/Item.ts'

// Carpentry block items
import { OakPlanksBlockItem } from '../items/blocks/oak_planks/OakPlanksBlockItem.ts'
import { PinePlanksBlockItem } from '../items/blocks/pine_planks/PinePlanksBlockItem.ts'
import { RedwoodPlanksBlockItem } from '../items/blocks/redwood_planks/RedwoodPlanksBlockItem.ts'
import { OakSlabBlockItem } from '../items/blocks/oak_slab/OakSlabBlockItem.ts'
import { PineSlabBlockItem } from '../items/blocks/pine_slab/PineSlabBlockItem.ts'
import { RedwoodSlabBlockItem } from '../items/blocks/redwood_slab/RedwoodSlabBlockItem.ts'
import { OakStairsBlockItem } from '../items/blocks/oak_stairs/OakStairsBlockItem.ts'
import { PineStairsBlockItem } from '../items/blocks/pine_stairs/PineStairsBlockItem.ts'
import { RedwoodStairsBlockItem } from '../items/blocks/redwood_stairs/RedwoodStairsBlockItem.ts'
import { OakFenceBlockItem } from '../items/blocks/oak_fence/OakFenceBlockItem.ts'
import { PineFenceBlockItem } from '../items/blocks/pine_fence/PineFenceBlockItem.ts'
import { RedwoodFenceBlockItem } from '../items/blocks/redwood_fence/RedwoodFenceBlockItem.ts'
import { OakFenceGateBlockItem } from '../items/blocks/oak_fence_gate/OakFenceGateBlockItem.ts'
import { PineFenceGateBlockItem } from '../items/blocks/pine_fence_gate/PineFenceGateBlockItem.ts'
import { RedwoodFenceGateBlockItem } from '../items/blocks/redwood_fence_gate/RedwoodFenceGateBlockItem.ts'
import { OakDoorBlockItem } from '../items/blocks/oak_door/OakDoorBlockItem.ts'
import { PineDoorBlockItem } from '../items/blocks/pine_door/PineDoorBlockItem.ts'
import { RedwoodDoorBlockItem } from '../items/blocks/redwood_door/RedwoodDoorBlockItem.ts'
import { OakTrapdoorBlockItem } from '../items/blocks/oak_trapdoor/OakTrapdoorBlockItem.ts'
import { PineTrapdoorBlockItem } from '../items/blocks/pine_trapdoor/PineTrapdoorBlockItem.ts'
import { RedwoodTrapdoorBlockItem } from '../items/blocks/redwood_trapdoor/RedwoodTrapdoorBlockItem.ts'
import { OakTableBlockItem } from '../items/blocks/oak_table/OakTableBlockItem.ts'
import { PineTableBlockItem } from '../items/blocks/pine_table/PineTableBlockItem.ts'
import { RedwoodTableBlockItem } from '../items/blocks/redwood_table/RedwoodTableBlockItem.ts'
import { OakChairBlockItem } from '../items/blocks/oak_chair/OakChairBlockItem.ts'
import { PineChairBlockItem } from '../items/blocks/pine_chair/PineChairBlockItem.ts'
import { RedwoodChairBlockItem } from '../items/blocks/redwood_chair/RedwoodChairBlockItem.ts'
import { OakShelfBlockItem } from '../items/blocks/oak_shelf/OakShelfBlockItem.ts'
import { PineShelfBlockItem } from '../items/blocks/pine_shelf/PineShelfBlockItem.ts'
import { RedwoodShelfBlockItem } from '../items/blocks/redwood_shelf/RedwoodShelfBlockItem.ts'
import { OakWindowBlockItem } from '../items/blocks/oak_window/OakWindowBlockItem.ts'
import { PineWindowBlockItem } from '../items/blocks/pine_window/PineWindowBlockItem.ts'
import { RedwoodWindowBlockItem } from '../items/blocks/redwood_window/RedwoodWindowBlockItem.ts'
import { StickItem } from '../items/materials/stick/StickItem.ts'

// Block items
import { GrassBlockItem } from '../items/blocks/grass/GrassBlockItem.ts'
import { DirtBlockItem } from '../items/blocks/dirt/DirtBlockItem.ts'
import { StoneBlockItem } from '../items/blocks/stone/StoneBlockItem.ts'
import { OakLogBlockItem } from '../items/blocks/oak_log/OakLogBlockItem.ts'
import { OakLeavesBlockItem } from '../items/blocks/oak_leaves/OakLeavesBlockItem.ts'
import { IronBlockItem } from '../items/blocks/iron_block/IronBlockItem.ts'
import { CopperBlockItem } from '../items/blocks/copper_block/CopperBlockItem.ts'
import { CoalBlockItem } from '../items/blocks/coal_block/CoalBlockItem.ts'
import { GoldBlockItem } from '../items/blocks/gold_block/GoldBlockItem.ts'
import { DiamondBlockItem } from '../items/blocks/diamond_block/DiamondBlockItem.ts'
import { TorchBlockItem } from '../items/blocks/torch/TorchBlockItem.ts'
import { ForgeBlockItem } from '../items/blocks/forge/ForgeBlockItem.ts'
import { MudBlockItem } from '../items/blocks/mud/MudBlockItem.ts'
import { MuddyGrassBlockItem } from '../items/blocks/muddy_grass/MuddyGrassBlockItem.ts'
import { BlueMushroomBlockItem } from '../items/blocks/blue_mushroom/BlueMushroomBlockItem.ts'
import { BlueMushroomCapBlockItem } from '../items/blocks/blue_mushroom_cap/BlueMushroomCapBlockItem.ts'
import { PurpleMushroomBlockItem } from '../items/blocks/purple_mushroom/PurpleMushroomBlockItem.ts'
import { PurpleMushroomCapBlockItem } from '../items/blocks/purple_mushroom_cap/PurpleMushroomCapBlockItem.ts'
import { SandBlockItem } from '../items/blocks/sand/SandBlockItem.ts'
import { SandstoneBlockItem } from '../items/blocks/sandstone/SandstoneBlockItem.ts'
import { CactusBlockItem } from '../items/blocks/cactus/CactusBlockItem.ts'
import { BasaltBlockItem } from '../items/blocks/basalt/BasaltBlockItem.ts'
import { MagmaBlockItem } from '../items/blocks/magma/MagmaBlockItem.ts'
import { VineBlockItem } from '../items/blocks/vine/VineBlockItem.ts'
import { ClayBlockItem } from '../items/blocks/clay/ClayBlockItem.ts'
import { MushroomBlockItem } from '../items/blocks/mushroom/MushroomBlockItem.ts'
import { MushroomCapBlockItem } from '../items/blocks/mushroom-cap/MushroomCapBlockItem.ts'
import { Wheat1BlockItem } from '../items/blocks/wheat/Wheat1BlockItem.ts'
import { Wheat2BlockItem } from '../items/blocks/wheat/Wheat2BlockItem.ts'
import { Wheat3BlockItem } from '../items/blocks/wheat/Wheat3BlockItem.ts'
import { HellRockBlockItem } from '../items/blocks/hell_rock/HellRockBlockItem.ts'
import { HellMagmaBlockItem } from '../items/blocks/hell_magma/HellMagmaBlockItem.ts'
import { CorruptedHellRockBlockItem } from '../items/blocks/corrupted_hell_rock/CorruptedHellRockBlockItem.ts'
import { GlassBlockItem } from '../items/blocks/glass/GlassBlockItem.ts'
import { ApothecaryWorkbenchBlockItem } from '../items/blocks/apothecary_workbench/ApothecaryWorkbenchBlockItem.ts'
import { WoodworkingBenchBlockItem } from '../items/blocks/woodworking_bench/WoodworkingBenchBlockItem.ts'
import { YellowFlowerBlockItem } from '../items/blocks/yellow_flower/YellowFlowerBlockItem.ts'
import { BlueFlowerBlockItem } from '../items/blocks/blue_flower/BlueFlowerBlockItem.ts'
import { RedFlowerBlockItem } from '../items/blocks/red_flower/RedFlowerBlockItem.ts'
import { JungleFernBlockItem } from '../items/blocks/jungle_fern/JungleFernBlockItem.ts'
import { CattailBlockItem } from '../items/blocks/cattail/CattailBlockItem.ts'
import { Herb1BlockItem } from '../items/blocks/herb/Herb1BlockItem.ts'
import { LadderBlockItem } from '../items/blocks/ladder/LadderBlockItem.ts'
import { RopeLadderBlockItem } from '../items/blocks/rope_ladder/RopeLadderBlockItem.ts'
import { Hemp1BlockItem } from '../items/blocks/hemp/Hemp1BlockItem.ts'
import { Hemp2BlockItem } from '../items/blocks/hemp/Hemp2BlockItem.ts'
import { Hemp3BlockItem } from '../items/blocks/hemp/Hemp3BlockItem.ts'
import { BedBlockItem } from '../items/blocks/bed/BedBlockItem.ts'
import { DiviningStickBlockItem } from '../items/blocks/divining_stick/DiviningStickBlockItem.ts'
import { ChestBlockItem } from '../items/blocks/chest/ChestBlockItem.ts'
import { PineLogBlockItem } from '../items/blocks/pine_log/PineLogBlockItem.ts'
import { PineNeedlesBlockItem } from '../items/blocks/pine_needles/PineNeedlesBlockItem.ts'
import { PodzolBlockItem } from '../items/blocks/podzol/PodzolBlockItem.ts'
import { RedwoodLogBlockItem } from '../items/blocks/redwood_log/RedwoodLogBlockItem.ts'
import { RedwoodLeavesBlockItem } from '../items/blocks/redwood_leaves/RedwoodLeavesBlockItem.ts'
import { MossBlockItem } from '../items/blocks/moss/MossBlockItem.ts'
import { MossyStoneBlockItem } from '../items/blocks/mossy_stone/MossyStoneBlockItem.ts'
import { CoastalFernBlockItem } from '../items/blocks/coastal_fern/CoastalFernBlockItem.ts'

// Ore/resource items
import { CoalItem } from '../items/ores/coal/CoalItem.ts'
import { IronOreItem } from '../items/ores/iron/IronOreItem.ts'
import { CopperOreItem } from '../items/ores/copper/CopperOreItem.ts'
import { GoldOreItem } from '../items/ores/gold/GoldOreItem.ts'
import { DiamondItem } from '../items/ores/diamond/DiamondItem.ts'

// Food items
import { RawPorkItem } from '../items/food/raw_pork/RawPorkItem.ts'
import { CookedPorkItem } from '../items/food/cooked_pork/CookedPorkItem.ts'
import { RawFoxMeatItem } from '../items/food/raw_fox_meat/RawFoxMeatItem.ts'
import { CookedFoxMeatItem } from '../items/food/cooked_fox_meat/CookedFoxMeatItem.ts'
import { RawBeefItem } from '../items/food/raw_beef/RawBeefItem.ts'
import { CookedBeefItem } from '../items/food/cooked_beef/CookedBeefItem.ts'
import { RawRabbitItem } from '../items/food/raw_rabbit/RawRabbitItem.ts'
import { CookedRabbitItem } from '../items/food/cooked_rabbit/CookedRabbitItem.ts'
import { WheatItem } from '../items/food/wheat/WheatItem.ts'
import { GroundWheatItem } from '../items/food/ground_wheat/GroundWheatItem.ts'
import { BreadItem } from '../items/food/bread/BreadItem.ts'
import { RawAlligatorMeatItem } from '../items/food/raw_alligator_meat/RawAlligatorMeatItem.ts'
import { CookedAlligatorMeatItem } from '../items/food/cooked_alligator_meat/CookedAlligatorMeatItem.ts'
import { RawSnakeItem } from '../items/food/raw_snake/RawSnakeItem.ts'
import { CookedSnakeItem } from '../items/food/cooked_snake/CookedSnakeItem.ts'
import { RawKomodoMeatItem } from '../items/food/raw_komodo_meat/RawKomodoMeatItem.ts'
import { CookedKomodoMeatItem } from '../items/food/cooked_komodo_meat/CookedKomodoMeatItem.ts'
import { PineNeedleTeaItem } from '../items/food/pine_needle_tea/PineNeedleTeaItem.ts'
import { RawCrabMeatItem } from '../items/food/raw_crab_meat/RawCrabMeatItem.ts'
import { CookedCrabMeatItem } from '../items/food/cooked_crab_meat/CookedCrabMeatItem.ts'
import { FiddleheadsItem } from '../items/food/fiddleheads/FiddleheadsItem.ts'
import { CookedFiddleheadsItem } from '../items/food/cooked_fiddleheads/CookedFiddleheadsItem.ts'

// Bar items
import { IronBarItem } from '../items/bars/iron/IronBarItem.ts'

// Material items
import { SlimeBallItem } from '../items/materials/slime_ball/SlimeBallItem.ts'
import { AlligatorLeatherItem } from '../items/materials/alligator_leather/AlligatorLeatherItem.ts'
import { KomodoScalesItem } from '../items/materials/komodo_scales/KomodoScalesItem.ts'
import { CorruptedEssenceItem } from '../items/materials/corrupted_essence/CorruptedEssenceItem.ts'
import { BoneItem } from '../items/materials/bone/BoneItem.ts'
import { EmberRoachWingItem } from '../items/materials/ember_roach_wing/EmberRoachWingItem.ts'
import { HerbItem } from '../items/materials/herb/HerbItem.ts'
import { HempFiberItem } from '../items/materials/hemp_fiber/HempFiberItem.ts'
import { RopeItem } from '../items/materials/rope/RopeItem.ts'
import { CharcoalItem } from '../items/materials/charcoal/CharcoalItem.ts'
import { PineResinItem } from '../items/materials/pine_resin/PineResinItem.ts'
import { PineconeItem } from '../items/materials/pinecone/PineconeItem.ts'
import { PineSaplingBlockItem } from '../items/blocks/pine_sapling/PineSaplingBlockItem.ts'
import { ResinTapBlockItem } from '../items/blocks/resin_tap/ResinTapBlockItem.ts'
import { BerriesItem } from '../items/food/berries/BerriesItem.ts'
import { MorelMushroomBlockItem } from '../items/blocks/morel_mushroom/MorelMushroomBlockItem.ts'
import { CookedMorelItem } from '../items/food/cooked_morel/CookedMorelItem.ts'
import { BerryBushBlockItem } from '../items/blocks/berry_bush/BerryBushBlockItem.ts'
import { VenisonItem } from '../items/food/venison/VenisonItem.ts'
import { WolfPeltItem } from '../items/materials/wolf_pelt/WolfPeltItem.ts'
import { BearPeltItem } from '../items/materials/bear_pelt/BearPeltItem.ts'
import { DriedMossItem } from '../items/materials/dried_moss/DriedMossItem.ts'
import { SeaShellBlockItem } from '../items/blocks/sea_shell/SeaShellBlockItem.ts'
import { SeaStarBlockItem } from '../items/blocks/sea_star/SeaStarBlockItem.ts'
import { CrabShellBlockItem } from '../items/blocks/crab_shell/CrabShellBlockItem.ts'
import { ResinTorchBlockItem } from '../items/blocks/resin_torch/ResinTorchBlockItem.ts'
import { GoldBarItem } from '../items/bars/gold/GoldBarItem.ts'
import { CopperBarItem } from '../items/bars/copper/CopperBarItem.ts'
import { SteelBarItem } from '../items/bars/steel/SteelBarItem.ts'

// Potion items
import { HealthPotion1Item } from '../items/potions/health_potion_1/HealthPotion1Item.ts'
import { HealthPotion2Item } from '../items/potions/health_potion_2/HealthPotion2Item.ts'
import { HealthPotion3Item } from '../items/potions/health_potion_3/HealthPotion3Item.ts'

// Tool items - Pickaxes
import { WoodPickaxeItem } from '../items/tools/pickaxe/WoodPickaxeItem.ts'
import { StonePickaxeItem } from '../items/tools/pickaxe/StonePickaxeItem.ts'
import { IronPickaxeItem } from '../items/tools/pickaxe/IronPickaxeItem.ts'
import { SteelPickaxeItem } from '../items/tools/pickaxe/SteelPickaxeItem.ts'
import { DiamondPickaxeItem } from '../items/tools/pickaxe/DiamondPickaxeItem.ts'

// Tool items - Shovels
import { WoodShovelItem } from '../items/tools/shovel/WoodShovelItem.ts'
import { StoneShovelItem } from '../items/tools/shovel/StoneShovelItem.ts'
import { IronShovelItem } from '../items/tools/shovel/IronShovelItem.ts'
import { SteelShovelItem } from '../items/tools/shovel/SteelShovelItem.ts'
import { DiamondShovelItem } from '../items/tools/shovel/DiamondShovelItem.ts'

// Tool items - Axes
import { WoodAxeItem } from '../items/tools/axe/WoodAxeItem.ts'
import { StoneAxeItem } from '../items/tools/axe/StoneAxeItem.ts'
import { IronAxeItem } from '../items/tools/axe/IronAxeItem.ts'
import { SteelAxeItem } from '../items/tools/axe/SteelAxeItem.ts'
import { DiamondAxeItem } from '../items/tools/axe/DiamondAxeItem.ts'

type ItemFactory = () => IItem

// Map of item IDs to factory functions
const itemFactories: Map<string, ItemFactory> = new Map()

/**
 * Register an item factory for a given ID.
 */
export function registerItemFactory(id: string, factory: ItemFactory): void {
  itemFactories.set(id, factory)
}

/**
 * Create an item instance from its ID.
 * Returns null if the item ID is not registered.
 */
export function createItemFromId(id: string): IItem | null {
  const factory = itemFactories.get(id)
  if (!factory) {
    console.warn(`Unknown item ID: ${id}`)
    return null
  }
  return factory()
}

/**
 * Check if an item ID is registered.
 */
export function isItemRegistered(id: string): boolean {
  return itemFactories.has(id)
}

/**
 * Get all registered item IDs.
 */
export function getRegisteredItemIds(): string[] {
  return Array.from(itemFactories.keys())
}

/**
 * Initialize the item registry with all known items.
 * Call this once at startup before loading saved inventory.
 */
export function initializeItemRegistry(): void {
  // Block items
  registerItemFactory('grass_block', () => new GrassBlockItem())
  registerItemFactory('dirt_block', () => new DirtBlockItem())
  registerItemFactory('stone_block', () => new StoneBlockItem())
  registerItemFactory('oak_log_block', () => new OakLogBlockItem())
  registerItemFactory('oak_leaves_block', () => new OakLeavesBlockItem())
  registerItemFactory('iron_block', () => new IronBlockItem())
  registerItemFactory('copper_block', () => new CopperBlockItem())
  registerItemFactory('coal_block', () => new CoalBlockItem())
  registerItemFactory('gold_block', () => new GoldBlockItem())
  registerItemFactory('diamond_block', () => new DiamondBlockItem())
  registerItemFactory('torch_block', () => new TorchBlockItem())
  registerItemFactory('forge_block', () => new ForgeBlockItem())
  registerItemFactory('mud_block', () => new MudBlockItem())
  registerItemFactory('muddy_grass_block', () => new MuddyGrassBlockItem())
  registerItemFactory('blue_mushroom_block', () => new BlueMushroomBlockItem())
  registerItemFactory('blue_mushroom_cap_block', () => new BlueMushroomCapBlockItem())
  registerItemFactory('purple_mushroom_block', () => new PurpleMushroomBlockItem())
  registerItemFactory('purple_mushroom_cap_block', () => new PurpleMushroomCapBlockItem())
  registerItemFactory('sand_block', () => new SandBlockItem())
  registerItemFactory('sandstone_block', () => new SandstoneBlockItem())
  registerItemFactory('cactus_block', () => new CactusBlockItem())
  registerItemFactory('basalt_block', () => new BasaltBlockItem())
  registerItemFactory('magma_block', () => new MagmaBlockItem())
  registerItemFactory('vine_block', () => new VineBlockItem())
  registerItemFactory('clay_block', () => new ClayBlockItem())
  registerItemFactory('mushroom_block', () => new MushroomBlockItem())
  registerItemFactory('mushroom_cap_block', () => new MushroomCapBlockItem())
  registerItemFactory('wheat_1_block', () => new Wheat1BlockItem())
  registerItemFactory('wheat_2_block', () => new Wheat2BlockItem())
  registerItemFactory('wheat_3_block', () => new Wheat3BlockItem())
  registerItemFactory('hell_rock_block', () => new HellRockBlockItem())
  registerItemFactory('hell_magma_block', () => new HellMagmaBlockItem())
  registerItemFactory('corrupted_hell_rock_block', () => new CorruptedHellRockBlockItem())
  registerItemFactory('glass_block', () => new GlassBlockItem())
  registerItemFactory('apothecary_workbench_block', () => new ApothecaryWorkbenchBlockItem())
  registerItemFactory('woodworking_bench_block', () => new WoodworkingBenchBlockItem())
  registerItemFactory('yellow_flower_block', () => new YellowFlowerBlockItem())
  registerItemFactory('blue_flower_block', () => new BlueFlowerBlockItem())
  registerItemFactory('red_flower_block', () => new RedFlowerBlockItem())
  registerItemFactory('jungle_fern_block', () => new JungleFernBlockItem())
  registerItemFactory('cattail_block', () => new CattailBlockItem())
  registerItemFactory('herb_1_block', () => new Herb1BlockItem())
  registerItemFactory('ladder_block', () => new LadderBlockItem())
  registerItemFactory('rope_ladder_block', () => new RopeLadderBlockItem())
  registerItemFactory('hemp_1_block', () => new Hemp1BlockItem())
  registerItemFactory('hemp_2_block', () => new Hemp2BlockItem())
  registerItemFactory('hemp_3_block', () => new Hemp3BlockItem())
  registerItemFactory('bed_head_block', () => new BedBlockItem())
  registerItemFactory('divining_stick_block', () => new DiviningStickBlockItem())
  registerItemFactory('chest_block', () => new ChestBlockItem())
  registerItemFactory('pine_log_block', () => new PineLogBlockItem())
  registerItemFactory('pine_needles_block', () => new PineNeedlesBlockItem())
  registerItemFactory('podzol_block', () => new PodzolBlockItem())
  registerItemFactory('redwood_log_block', () => new RedwoodLogBlockItem())
  registerItemFactory('redwood_leaves_block', () => new RedwoodLeavesBlockItem())
  registerItemFactory('moss_block', () => new MossBlockItem())
  registerItemFactory('mossy_stone_block', () => new MossyStoneBlockItem())
  registerItemFactory('coastal_fern_block', () => new CoastalFernBlockItem())

  // Ore/resource items
  registerItemFactory('coal', () => new CoalItem())
  registerItemFactory('iron_ore', () => new IronOreItem())
  registerItemFactory('copper_ore', () => new CopperOreItem())
  registerItemFactory('gold_ore', () => new GoldOreItem())
  registerItemFactory('diamond', () => new DiamondItem())

  // Food items
  registerItemFactory('raw_pork', () => new RawPorkItem())
  registerItemFactory('cooked_pork', () => new CookedPorkItem())
  registerItemFactory('raw_fox_meat', () => new RawFoxMeatItem())
  registerItemFactory('cooked_fox_meat', () => new CookedFoxMeatItem())
  registerItemFactory('raw_beef', () => new RawBeefItem())
  registerItemFactory('cooked_beef', () => new CookedBeefItem())
  registerItemFactory('raw_rabbit', () => new RawRabbitItem())
  registerItemFactory('cooked_rabbit', () => new CookedRabbitItem())
  registerItemFactory('wheat', () => new WheatItem())
  registerItemFactory('ground_wheat', () => new GroundWheatItem())
  registerItemFactory('bread', () => new BreadItem())
  registerItemFactory('raw_alligator_meat', () => new RawAlligatorMeatItem())
  registerItemFactory('cooked_alligator_meat', () => new CookedAlligatorMeatItem())
  registerItemFactory('raw_snake', () => new RawSnakeItem())
  registerItemFactory('cooked_snake', () => new CookedSnakeItem())
  registerItemFactory('raw_komodo_meat', () => new RawKomodoMeatItem())
  registerItemFactory('cooked_komodo_meat', () => new CookedKomodoMeatItem())
  registerItemFactory('pine_needle_tea', () => new PineNeedleTeaItem())
  registerItemFactory('raw_crab_meat', () => new RawCrabMeatItem())
  registerItemFactory('cooked_crab_meat', () => new CookedCrabMeatItem())
  registerItemFactory('fiddleheads', () => new FiddleheadsItem())
  registerItemFactory('cooked_fiddleheads', () => new CookedFiddleheadsItem())

  // Bar items
  registerItemFactory('iron_bar', () => new IronBarItem())
  registerItemFactory('gold_bar', () => new GoldBarItem())
  registerItemFactory('copper_bar', () => new CopperBarItem())
  registerItemFactory('steel_bar', () => new SteelBarItem())

  // Material items
  registerItemFactory('slime_ball', () => new SlimeBallItem())
  registerItemFactory('alligator_leather', () => new AlligatorLeatherItem())
  registerItemFactory('komodo_scales', () => new KomodoScalesItem())
  registerItemFactory('corrupted_essence', () => new CorruptedEssenceItem())
  registerItemFactory('bone', () => new BoneItem())
  registerItemFactory('ember_roach_wing', () => new EmberRoachWingItem())
  registerItemFactory('herb', () => new HerbItem())
  registerItemFactory('hemp_fiber', () => new HempFiberItem())
  registerItemFactory('rope', () => new RopeItem())
  registerItemFactory('charcoal', () => new CharcoalItem())
  registerItemFactory('pine_resin', () => new PineResinItem())
  registerItemFactory('pinecone', () => new PineconeItem())
  registerItemFactory('pine_sapling_block', () => new PineSaplingBlockItem())
  registerItemFactory('resin_tap_block', () => new ResinTapBlockItem())
  registerItemFactory('berries', () => new BerriesItem())
  registerItemFactory('morel_mushroom_block', () => new MorelMushroomBlockItem())
  registerItemFactory('cooked_morel', () => new CookedMorelItem())
  registerItemFactory('berry_bush_block', () => new BerryBushBlockItem())
  registerItemFactory('venison', () => new VenisonItem())
  registerItemFactory('wolf_pelt', () => new WolfPeltItem())
  registerItemFactory('bear_pelt', () => new BearPeltItem())
  registerItemFactory('dried_moss', () => new DriedMossItem())
  registerItemFactory('sea_shell_block', () => new SeaShellBlockItem())
  registerItemFactory('sea_star_block', () => new SeaStarBlockItem())
  registerItemFactory('crab_shell_block', () => new CrabShellBlockItem())
  registerItemFactory('resin_torch_block', () => new ResinTorchBlockItem())

  // Pickaxes
  registerItemFactory('wood_pickaxe', () => new WoodPickaxeItem())
  registerItemFactory('stone_pickaxe', () => new StonePickaxeItem())
  registerItemFactory('iron_pickaxe', () => new IronPickaxeItem())
  registerItemFactory('steel_pickaxe', () => new SteelPickaxeItem())
  registerItemFactory('diamond_pickaxe', () => new DiamondPickaxeItem())

  // Shovels
  registerItemFactory('wood_shovel', () => new WoodShovelItem())
  registerItemFactory('stone_shovel', () => new StoneShovelItem())
  registerItemFactory('iron_shovel', () => new IronShovelItem())
  registerItemFactory('steel_shovel', () => new SteelShovelItem())
  registerItemFactory('diamond_shovel', () => new DiamondShovelItem())

  // Axes
  registerItemFactory('wood_axe', () => new WoodAxeItem())
  registerItemFactory('stone_axe', () => new StoneAxeItem())
  registerItemFactory('iron_axe', () => new IronAxeItem())
  registerItemFactory('steel_axe', () => new SteelAxeItem())
  registerItemFactory('diamond_axe', () => new DiamondAxeItem())

  // Potions
  registerItemFactory('health_potion_1', () => new HealthPotion1Item())
  registerItemFactory('health_potion_2', () => new HealthPotion2Item())
  registerItemFactory('health_potion_3', () => new HealthPotion3Item())

  // Carpentry
  registerItemFactory('oak_planks_block', () => new OakPlanksBlockItem())
  registerItemFactory('pine_planks_block', () => new PinePlanksBlockItem())
  registerItemFactory('redwood_planks_block', () => new RedwoodPlanksBlockItem())
  registerItemFactory('oak_slab_block', () => new OakSlabBlockItem())
  registerItemFactory('pine_slab_block', () => new PineSlabBlockItem())
  registerItemFactory('redwood_slab_block', () => new RedwoodSlabBlockItem())
  registerItemFactory('oak_stairs_block', () => new OakStairsBlockItem())
  registerItemFactory('pine_stairs_block', () => new PineStairsBlockItem())
  registerItemFactory('redwood_stairs_block', () => new RedwoodStairsBlockItem())
  registerItemFactory('oak_fence_block', () => new OakFenceBlockItem())
  registerItemFactory('pine_fence_block', () => new PineFenceBlockItem())
  registerItemFactory('redwood_fence_block', () => new RedwoodFenceBlockItem())
  registerItemFactory('oak_fence_gate_block', () => new OakFenceGateBlockItem())
  registerItemFactory('pine_fence_gate_block', () => new PineFenceGateBlockItem())
  registerItemFactory('redwood_fence_gate_block', () => new RedwoodFenceGateBlockItem())
  registerItemFactory('oak_door_block', () => new OakDoorBlockItem())
  registerItemFactory('pine_door_block', () => new PineDoorBlockItem())
  registerItemFactory('redwood_door_block', () => new RedwoodDoorBlockItem())
  registerItemFactory('oak_trapdoor_block', () => new OakTrapdoorBlockItem())
  registerItemFactory('pine_trapdoor_block', () => new PineTrapdoorBlockItem())
  registerItemFactory('redwood_trapdoor_block', () => new RedwoodTrapdoorBlockItem())
  registerItemFactory('oak_table_block', () => new OakTableBlockItem())
  registerItemFactory('pine_table_block', () => new PineTableBlockItem())
  registerItemFactory('redwood_table_block', () => new RedwoodTableBlockItem())
  registerItemFactory('oak_chair_block', () => new OakChairBlockItem())
  registerItemFactory('pine_chair_block', () => new PineChairBlockItem())
  registerItemFactory('redwood_chair_block', () => new RedwoodChairBlockItem())
  registerItemFactory('oak_shelf_block', () => new OakShelfBlockItem())
  registerItemFactory('pine_shelf_block', () => new PineShelfBlockItem())
  registerItemFactory('redwood_shelf_block', () => new RedwoodShelfBlockItem())
  registerItemFactory('oak_window_block', () => new OakWindowBlockItem())
  registerItemFactory('pine_window_block', () => new PineWindowBlockItem())
  registerItemFactory('redwood_window_block', () => new RedwoodWindowBlockItem())
  registerItemFactory('stick', () => new StickItem())

  console.log(`Item registry initialized with ${itemFactories.size} items`)
}
