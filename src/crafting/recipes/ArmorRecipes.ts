import type { IRecipe, IRecipeIngredient } from '../RecipeRegistry.ts'
import { TieredArmorItem } from '../../items/armor/TieredArmorItem.ts'
import { ARMOR_SLOTS, ARMOR_TIERS, armorItemId, type ArmorSlot, type ArmorTierId } from '../../items/armor/ArmorTiers.ts'
import { ItemTags } from '../../items/tags/ItemTags.ts'

/**
 * Armor recipes (DESIGN §4).
 *
 * Hand crafting (3x2 shapeless grid, counts stack in a slot):
 * - leather: any hide (wolf/bear pelt, alligator leather, komodo scales)
 * - copper / iron / steel / diamond: bars or diamonds
 * Hellforge:
 * - infernium: the diamond piece + infernium ingots
 * - hellbane: the infernium piece + a guardian sigil + 2 ingots + 2 biome materials
 */

/** Hides per leather piece (pelts drop 1-2 per kill). */
const LEATHER_COUNTS: Readonly<Record<ArmorSlot, number>> = { head: 3, chest: 5, legs: 4, feet: 2 }

/** Bars (or diamonds) per metal piece. */
const METAL_COUNTS: Readonly<Record<ArmorSlot, number>> = { head: 5, chest: 8, legs: 7, feet: 4 }

const METAL_MATERIALS: ReadonlyArray<[ArmorTierId, string]> = [
  ['copper', 'copper_bar'],
  ['iron', 'iron_bar'],
  ['steel', 'steel_bar'],
  ['diamond', 'diamond'],
]

/** Infernium ingots added to a diamond piece at the Hellforge. */
const INFERNIUM_COUNTS: Readonly<Record<ArmorSlot, number>> = { head: 3, chest: 5, legs: 4, feet: 2 }

/** Hellbane: guardian sigil + biome material per piece. */
const HELLBANE_PARTS: Readonly<Record<ArmorSlot, { sigil: string; material: string }>> = {
  head: { sigil: 'bone_sigil', material: 'soul_shard' },
  chest: { sigil: 'ember_sigil', material: 'magma_cream' },
  legs: { sigil: 'spore_sigil', material: 'glowcap' },
  feet: { sigil: 'rime_sigil', material: 'rime_crystal' },
}

function armorRecipe(tier: ArmorTierId, slot: ArmorSlot, ingredients: IRecipeIngredient[]): IRecipe {
  return {
    id: armorItemId(tier, slot),
    name: ARMOR_TIERS[tier].names[slot],
    ingredients,
    createResult: () => new TieredArmorItem(tier, slot),
    resultCount: 1,
  }
}

/** Leather + metal armor, crafted by hand. */
export const armorHandRecipes: IRecipe[] = [
  ...ARMOR_SLOTS.map((slot) => armorRecipe('leather', slot, [{ tag: ItemTags.HIDE, count: LEATHER_COUNTS[slot] }])),
  ...METAL_MATERIALS.flatMap(([tier, material]) =>
    ARMOR_SLOTS.map((slot) => armorRecipe(tier, slot, [{ itemId: material, count: METAL_COUNTS[slot] }])),
  ),
]

/** Infernium + hellbane armor, crafted at the Hellforge (hellforgeRegistry). */
export const armorHellforgeRecipes: IRecipe[] = [
  ...ARMOR_SLOTS.map((slot) =>
    armorRecipe('infernium', slot, [
      { itemId: armorItemId('diamond', slot), count: 1 },
      { itemId: 'infernium_ingot', count: INFERNIUM_COUNTS[slot] },
    ]),
  ),
  ...ARMOR_SLOTS.map((slot) =>
    armorRecipe('hellbane', slot, [
      { itemId: armorItemId('infernium', slot), count: 1 },
      { itemId: HELLBANE_PARTS[slot].sigil, count: 1 },
      { itemId: 'infernium_ingot', count: 2 },
      { itemId: HELLBANE_PARTS[slot].material, count: 2 },
    ]),
  ),
]
