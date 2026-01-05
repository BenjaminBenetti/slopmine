/**
 * Centralized block tag constants.
 * Tags are used for tool damage multipliers and block categorization.
 */
export const BlockTags = {
  STONE: 'stone',
  WOOD: 'wood',
  DIRT: 'dirt',
  LEAVES: 'leaves',
  METAL: 'metal',
} as const

export type BlockTag = (typeof BlockTags)[keyof typeof BlockTags]
