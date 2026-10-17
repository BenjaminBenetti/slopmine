/**
 * Armor slots, tiers and their numbers (DESIGN §8).
 *
 * Every armor piece is one (tier, slot) pair: item id `<tier>_<piece>`
 * (e.g. `iron_helmet`), armor points from the tier's table, and the tier id
 * doubles as the set id for full-set bonuses.
 */

/** Body slot an armor piece is worn in. */
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet'

/** Slots in display order (top to bottom). */
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['head', 'chest', 'legs', 'feet']

/** Item-id suffix of each slot's piece. */
export const ARMOR_PIECE_NAMES: Readonly<Record<ArmorSlot, string>> = {
  head: 'helmet',
  chest: 'chestplate',
  legs: 'leggings',
  feet: 'boots',
}

export type ArmorTierId = 'leather' | 'copper' | 'iron' | 'steel' | 'diamond' | 'infernium' | 'hellbane'

export interface ArmorTierInfo {
  readonly id: ArmorTierId
  /** Progression tier, aligned with tool tiers (leather 1 ... hellbane 7) */
  readonly tier: number
  /** Armor points per slot */
  readonly points: Readonly<Record<ArmorSlot, number>>
  /** Display names per slot */
  readonly names: Readonly<Record<ArmorSlot, string>>
}

function metalNames(material: string): Readonly<Record<ArmorSlot, string>> {
  return {
    head: `${material} Helmet`,
    chest: `${material} Chestplate`,
    legs: `${material} Leggings`,
    feet: `${material} Boots`,
  }
}

export const ARMOR_TIERS: Readonly<Record<ArmorTierId, ArmorTierInfo>> = {
  leather: {
    id: 'leather',
    tier: 1,
    points: { head: 1, chest: 3, legs: 2, feet: 1 },
    names: { head: 'Leather Cap', chest: 'Leather Tunic', legs: 'Leather Leggings', feet: 'Leather Boots' },
  },
  copper: { id: 'copper', tier: 2, points: { head: 2, chest: 4, legs: 3, feet: 1 }, names: metalNames('Copper') },
  iron: { id: 'iron', tier: 3, points: { head: 2, chest: 6, legs: 5, feet: 2 }, names: metalNames('Iron') },
  steel: { id: 'steel', tier: 4, points: { head: 3, chest: 7, legs: 6, feet: 3 }, names: metalNames('Steel') },
  diamond: { id: 'diamond', tier: 5, points: { head: 3, chest: 8, legs: 6, feet: 3 }, names: metalNames('Diamond') },
  infernium: {
    id: 'infernium',
    tier: 6,
    points: { head: 4, chest: 8, legs: 7, feet: 4 },
    names: metalNames('Infernium'),
  },
  hellbane: { id: 'hellbane', tier: 7, points: { head: 4, chest: 9, legs: 7, feet: 4 }, names: metalNames('Hellbane') },
}

/** Tiers in progression order. */
export const ARMOR_TIER_IDS: readonly ArmorTierId[] = [
  'leather',
  'copper',
  'iron',
  'steel',
  'diamond',
  'infernium',
  'hellbane',
]

/** Item id of a tier's piece for a slot, e.g. `armorItemId('iron', 'head')` = `iron_helmet`. */
export function armorItemId(tier: ArmorTierId, slot: ArmorSlot): string {
  return `${tier}_${ARMOR_PIECE_NAMES[slot]}`
}

/** Highest armor total any full set reaches (hellbane: 24). */
export const MAX_ARMOR_POINTS = Math.max(
  ...ARMOR_TIER_IDS.map((id) => {
    const p = ARMOR_TIERS[id].points
    return p.head + p.chest + p.legs + p.feet
  }),
)
