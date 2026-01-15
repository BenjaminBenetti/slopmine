/**
 * Item factory registry for deserializing inventory items.
 * Maps item IDs to factory functions that create item instances.
 */

import type { IItem } from '../items/Item.ts'

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

// Ore/resource items
import { CoalItem } from '../items/ores/coal/CoalItem.ts'
import { IronOreItem } from '../items/ores/iron/IronOreItem.ts'
import { CopperOreItem } from '../items/ores/copper/CopperOreItem.ts'
import { GoldOreItem } from '../items/ores/gold/GoldOreItem.ts'
import { DiamondItem } from '../items/ores/diamond/DiamondItem.ts'

// Food items
import { RawPorkItem } from '../items/food/raw_pork/RawPorkItem.ts'
import { CookedPorkItem } from '../items/food/cooked_pork/CookedPorkItem.ts'

// Bar items
import { IronBarItem } from '../items/bars/iron/IronBarItem.ts'
import { GoldBarItem } from '../items/bars/gold/GoldBarItem.ts'
import { CopperBarItem } from '../items/bars/copper/CopperBarItem.ts'
import { SteelBarItem } from '../items/bars/steel/SteelBarItem.ts'

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

  // Ore/resource items
  registerItemFactory('coal', () => new CoalItem())
  registerItemFactory('iron_ore', () => new IronOreItem())
  registerItemFactory('copper_ore', () => new CopperOreItem())
  registerItemFactory('gold_ore', () => new GoldOreItem())
  registerItemFactory('diamond', () => new DiamondItem())

  // Food items
  registerItemFactory('raw_pork', () => new RawPorkItem())
  registerItemFactory('cooked_pork', () => new CookedPorkItem())

  // Bar items
  registerItemFactory('iron_bar', () => new IronBarItem())
  registerItemFactory('gold_bar', () => new GoldBarItem())
  registerItemFactory('copper_bar', () => new CopperBarItem())
  registerItemFactory('steel_bar', () => new SteelBarItem())

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

  console.log(`Item registry initialized with ${itemFactories.size} items`)
}
