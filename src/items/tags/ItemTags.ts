/**
 * Centralized item tag constants.
 * Tags are used for recipe matching (e.g., any "wood" item can craft wood tools).
 */
export const ItemTags = {
  WOOD: 'wood',
  STONE: 'stone',
  METAL: 'metal',
  ORE: 'ore',
  FUEL: 'fuel',
  BAR: 'bar',
  COAL: 'coal',
  LOG: 'log',
  PLANK: 'plank',
  /** Animal hides that make leather armor (pelts, leather, scales) */
  HIDE: 'hide',
  /** Plants that rot down into bone meal (4 → 1); see blockItemTags.ts */
  COMPOSTABLE: 'compostable',
  /** Edible leaves and flowers for a forager's salad */
  SALAD_GREEN: 'salad_green',
  /** Stalactites, stalagmites and dripstone columns (4 → 1 dripstone block) */
  DRIPSTONE_FORMATION: 'dripstone_formation',
} as const

export type ItemTag = (typeof ItemTags)[keyof typeof ItemTags]
