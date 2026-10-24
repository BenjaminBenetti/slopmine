import type { IItem } from '../Item.ts'
import { RoastedPuffballItem } from './roasted_puffball/RoastedPuffballItem.ts'
import { RoastedToadstoolItem } from './roasted_toadstool/RoastedToadstoolItem.ts'
import { MushroomSkewerItem } from './mushroom_skewer/MushroomSkewerItem.ts'
import { ForagerSaladItem } from './forager_salad/ForagerSaladItem.ts'

/**
 * Register the forager's foods (cooked wild mushrooms, the skewer and the
 * salad - crafting/recipes/ForageRecipes.ts) with the persistence item
 * registry (the registrar is ItemRegistry's registerItemFactory, passed in to
 * keep this module free of a circular import).
 */
export function registerForageFoodItems(register: (id: string, factory: () => IItem) => void): void {
  register('roasted_puffball', () => new RoastedPuffballItem())
  register('roasted_toadstool', () => new RoastedToadstoolItem())
  register('mushroom_skewer', () => new MushroomSkewerItem())
  register('forager_salad', () => new ForagerSaladItem())
}
