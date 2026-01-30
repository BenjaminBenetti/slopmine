import type { ISmeltingRecipe } from '../../smelting/interfaces/ISmeltingRecipe.ts'
import { IronBarItem, GoldBarItem, CopperBarItem, SteelBarItem } from '../../items/bars/index.ts'
import { GlassBlockItem } from '../../items/blocks/glass/GlassBlockItem.ts'
import { CharcoalItem } from '../../items/materials/charcoal/CharcoalItem.ts'
import { ItemTags } from '../../items/tags/index.ts'
import { CookedPorkItem } from '../../items/food/cooked_pork/CookedPorkItem.ts'
import { CookedFoxMeatItem } from '../../items/food/cooked_fox_meat/CookedFoxMeatItem.ts'
import { CookedBeefItem } from '../../items/food/cooked_beef/CookedBeefItem.ts'
import { CookedRabbitItem } from '../../items/food/cooked_rabbit/CookedRabbitItem.ts'
import { CookedAlligatorMeatItem } from '../../items/food/cooked_alligator_meat/CookedAlligatorMeatItem.ts'
import { CookedSnakeItem } from '../../items/food/cooked_snake/CookedSnakeItem.ts'
import { CookedKomodoMeatItem } from '../../items/food/cooked_komodo_meat/CookedKomodoMeatItem.ts'
import { BreadItem } from '../../items/food/bread/BreadItem.ts'

// Ore smelting recipes
export const smeltIronOreRecipe: ISmeltingRecipe = {
  id: 'smelt_iron_ore',
  name: 'Iron Bar',
  inputId: 'iron_ore',
  createResult: () => new IronBarItem(),
  resultCount: 1,
  smeltTime: 10,
}

export const smeltGoldOreRecipe: ISmeltingRecipe = {
  id: 'smelt_gold_ore',
  name: 'Gold Bar',
  inputId: 'gold_ore',
  createResult: () => new GoldBarItem(),
  resultCount: 1,
  smeltTime: 12,
}

export const smeltCopperOreRecipe: ISmeltingRecipe = {
  id: 'smelt_copper_ore',
  name: 'Copper Bar',
  inputId: 'copper_ore',
  createResult: () => new CopperBarItem(),
  resultCount: 1,
  smeltTime: 8,
}

export const smeltIronBarRecipe: ISmeltingRecipe = {
  id: 'smelt_iron_bar',
  name: 'Steel Bar',
  inputId: 'iron_bar',
  createResult: () => new SteelBarItem(),
  resultCount: 1,
  smeltTime: 30, // 30 seconds - requires high heat to convert iron to steel
}

// Cooking recipes
export const cookRawPorkRecipe: ISmeltingRecipe = {
  id: 'cook_raw_pork',
  name: 'Cooked Pork',
  inputId: 'raw_pork',
  createResult: () => new CookedPorkItem(),
  resultCount: 1,
  smeltTime: 5, // 5 seconds - quick cooking time
}

export const cookRawFoxMeatRecipe: ISmeltingRecipe = {
  id: 'cook_raw_fox_meat',
  name: 'Cooked Fox Meat',
  inputId: 'raw_fox_meat',
  createResult: () => new CookedFoxMeatItem(),
  resultCount: 1,
  smeltTime: 5, // 5 seconds - quick cooking time
}

export const cookRawBeefRecipe: ISmeltingRecipe = {
  id: 'cook_raw_beef',
  name: 'Cooked Beef',
  inputId: 'raw_beef',
  createResult: () => new CookedBeefItem(),
  resultCount: 1,
  smeltTime: 6, // 6 seconds - slightly longer for beef
}

export const cookRawRabbitRecipe: ISmeltingRecipe = {
  id: 'cook_raw_rabbit',
  name: 'Cooked Rabbit',
  inputId: 'raw_rabbit',
  createResult: () => new CookedRabbitItem(),
  resultCount: 1,
  smeltTime: 4, // 4 seconds - rabbit is small so cooks quickly
}

export const bakeBreadRecipe: ISmeltingRecipe = {
  id: 'bake_bread',
  name: 'Bread',
  inputId: 'ground_wheat',
  createResult: () => new BreadItem(),
  resultCount: 1,
  smeltTime: 12, // 12 seconds to bake bread
}

export const cookRawAlligatorMeatRecipe: ISmeltingRecipe = {
  id: 'cook_raw_alligator_meat',
  name: 'Cooked Alligator Meat',
  inputId: 'raw_alligator_meat',
  createResult: () => new CookedAlligatorMeatItem(),
  resultCount: 1,
  smeltTime: 7, // 7 seconds - alligator meat is tough
}

export const cookRawSnakeRecipe: ISmeltingRecipe = {
  id: 'cook_raw_snake',
  name: 'Cooked Snake',
  inputId: 'raw_snake',
  createResult: () => new CookedSnakeItem(),
  resultCount: 1,
  smeltTime: 6, // 6 seconds - snake meat cooks quickly
}

export const cookRawKomodoMeatRecipe: ISmeltingRecipe = {
  id: 'cook_raw_komodo_meat',
  name: 'Cooked Komodo Meat',
  inputId: 'raw_komodo_meat',
  createResult: () => new CookedKomodoMeatItem(),
  resultCount: 1,
  smeltTime: 7, // 7 seconds - komodo meat is thick
}

// Material recipes
export const smeltSandRecipe: ISmeltingRecipe = {
  id: 'smelt_sand',
  name: 'Glass',
  inputId: 'sand_block',
  createResult: () => new GlassBlockItem(),
  resultCount: 1,
  smeltTime: 10, // 10 seconds - melting sand into glass
}

export const smeltLogToCharcoalRecipe: ISmeltingRecipe = {
  id: 'smelt_log_to_charcoal',
  name: 'Charcoal',
  inputTag: ItemTags.LOG, // Any log item can be smelted to charcoal
  createResult: () => new CharcoalItem(),
  resultCount: 1,
  smeltTime: 10, // 10 seconds - charring wood into charcoal
}

/** All smelting recipes */
export const smeltingRecipes: ISmeltingRecipe[] = [
  // Ores
  smeltIronOreRecipe,
  smeltGoldOreRecipe,
  smeltCopperOreRecipe,
  smeltIronBarRecipe,
  // Cooking
  cookRawPorkRecipe,
  cookRawFoxMeatRecipe,
  cookRawBeefRecipe,
  cookRawRabbitRecipe,
  bakeBreadRecipe,
  cookRawAlligatorMeatRecipe,
  cookRawSnakeRecipe,
  cookRawKomodoMeatRecipe,
  // Materials
  smeltSandRecipe,
  smeltLogToCharcoalRecipe,
]
