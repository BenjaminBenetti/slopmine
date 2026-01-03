/**
 * Centralized item tag constants.
 * Tags are used for recipe matching (e.g., any "wood" item can craft wood tools).
 */
export const ItemTags = {
  WOOD: 'wood',
  STONE: 'stone',
} as const

export type ItemTag = (typeof ItemTags)[keyof typeof ItemTags]
