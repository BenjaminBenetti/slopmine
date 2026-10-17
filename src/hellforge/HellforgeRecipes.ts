import type { IRecipe } from '../crafting/RecipeRegistry.ts'
import { hellforgeRegistry } from './HellforgeRegistry.ts'
import { HellforgeBlockItem } from '../items/blocks/hellforge/HellforgeBlockItem.ts'
import { InferniumSwordItem } from '../items/weapons/sword/InferniumSwordItem.ts'
import { HellbaneSwordItem } from '../items/weapons/sword/HellbaneSwordItem.ts'
import { InferniumPickaxeItem } from '../items/tools/pickaxe/InferniumPickaxeItem.ts'
import { HellbanePickaxeItem } from '../items/tools/pickaxe/HellbanePickaxeItem.ts'
import { InferniumAxeItem } from '../items/tools/axe/InferniumAxeItem.ts'
import { HellbaneAxeItem } from '../items/tools/axe/HellbaneAxeItem.ts'
import { InferniumShovelItem } from '../items/tools/shovel/InferniumShovelItem.ts'
import { HellbaneShovelItem } from '../items/tools/shovel/HellbaneShovelItem.ts'

/**
 * The Hellforge station itself, crafted by hand once the first infernium is
 * smelted (DESIGN recipe contract).
 */
export const hellforgeStationRecipe: IRecipe = {
  id: 'craft_hellforge',
  name: 'Hellforge',
  ingredients: [
    { itemId: 'obsidian_block', count: 4 },
    { itemId: 'infernium_ingot', count: 2 },
    { itemId: 'gold_bar', count: 1 },
  ],
  createResult: () => new HellforgeBlockItem(),
  resultCount: 1,
}

// Infernium tier (6): the diamond item reforged with infernium ingots.

export const inferniumSwordRecipe: IRecipe = {
  id: 'infernium_sword',
  name: 'Infernium Sword',
  ingredients: [{ itemId: 'diamond_sword', count: 1 }, { itemId: 'infernium_ingot', count: 2 }],
  createResult: () => new InferniumSwordItem(),
  resultCount: 1,
}

export const inferniumPickaxeRecipe: IRecipe = {
  id: 'infernium_pickaxe',
  name: 'Infernium Pickaxe',
  ingredients: [{ itemId: 'diamond_pickaxe', count: 1 }, { itemId: 'infernium_ingot', count: 3 }],
  createResult: () => new InferniumPickaxeItem(),
  resultCount: 1,
}

export const inferniumAxeRecipe: IRecipe = {
  id: 'infernium_axe',
  name: 'Infernium Axe',
  ingredients: [{ itemId: 'diamond_axe', count: 1 }, { itemId: 'infernium_ingot', count: 3 }],
  createResult: () => new InferniumAxeItem(),
  resultCount: 1,
}

export const inferniumShovelRecipe: IRecipe = {
  id: 'infernium_shovel',
  name: 'Infernium Shovel',
  ingredients: [{ itemId: 'diamond_shovel', count: 1 }, { itemId: 'infernium_ingot', count: 1 }],
  createResult: () => new InferniumShovelItem(),
  resultCount: 1,
}

// Hellbane tier (7): the infernium item + a guardian's sigil + 2 infernium
// ingots + 2 of that guardian's biome material.

export const hellbaneSwordRecipe: IRecipe = {
  id: 'hellbane_sword',
  name: 'Hellbane Sword',
  ingredients: [
    { itemId: 'infernium_sword', count: 1 },
    { itemId: 'ember_sigil', count: 1 },
    { itemId: 'infernium_ingot', count: 2 },
    { itemId: 'magma_cream', count: 2 },
  ],
  createResult: () => new HellbaneSwordItem(),
  resultCount: 1,
}

export const hellbanePickaxeRecipe: IRecipe = {
  id: 'hellbane_pickaxe',
  name: 'Hellbane Pickaxe',
  ingredients: [
    { itemId: 'infernium_pickaxe', count: 1 },
    { itemId: 'prism_sigil', count: 1 },
    { itemId: 'infernium_ingot', count: 2 },
    { itemId: 'prism_shard', count: 2 },
  ],
  createResult: () => new HellbanePickaxeItem(),
  resultCount: 1,
}

export const hellbaneAxeRecipe: IRecipe = {
  id: 'hellbane_axe',
  name: 'Hellbane Axe',
  ingredients: [
    { itemId: 'infernium_axe', count: 1 },
    { itemId: 'bone_sigil', count: 1 },
    { itemId: 'infernium_ingot', count: 2 },
    { itemId: 'soul_shard', count: 2 },
  ],
  createResult: () => new HellbaneAxeItem(),
  resultCount: 1,
}

export const hellbaneShovelRecipe: IRecipe = {
  id: 'hellbane_shovel',
  name: 'Hellbane Shovel',
  ingredients: [
    { itemId: 'infernium_shovel', count: 1 },
    { itemId: 'spore_sigil', count: 1 },
    { itemId: 'infernium_ingot', count: 2 },
    { itemId: 'glowcap', count: 2 },
  ],
  createResult: () => new HellbaneShovelItem(),
  resultCount: 1,
}

/** Weapons-stream Hellforge recipes (armor registers its own pieces). */
export const hellforgeWeaponRecipes: IRecipe[] = [
  inferniumSwordRecipe,
  inferniumPickaxeRecipe,
  inferniumAxeRecipe,
  inferniumShovelRecipe,
  hellbaneSwordRecipe,
  hellbanePickaxeRecipe,
  hellbaneAxeRecipe,
  hellbaneShovelRecipe,
]

/** Register the weapon/tool recipes above into the Hellforge registry. */
export function registerHellforgeWeaponRecipes(): void {
  for (const recipe of hellforgeWeaponRecipes) {
    hellforgeRegistry.register(recipe)
  }
}
