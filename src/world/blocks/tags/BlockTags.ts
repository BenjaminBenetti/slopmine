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
  /** Liquid blocks that can sustain smaller liquid blocks (half or greater) */
  LIQUID_SOURCE: 'liquid_source',
} as const

export type BlockTag = (typeof BlockTags)[keyof typeof BlockTags]
