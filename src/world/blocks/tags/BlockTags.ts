/**
 * Centralized block tag constants.
 * Tags are used for tool damage multipliers and block categorization.
 */
export const BlockTags = {
  /** Pickaxe effective - stone, ores, brick-like blocks */
  ROCK: 'rock',
  /** Axe effective - wood, mushroom blocks, plant stems */
  WOOD: 'wood',
  /** Shovel effective - dirt, sand, mud, clay, gravel */
  SOIL: 'soil',
  /** Shears effective - leaves, vines */
  LEAVES: 'leaves',
  /** Liquid blocks that can sustain smaller liquid blocks (half or greater) */
  LIQUID_SOURCE: 'liquid_source',
} as const

export type BlockTag = (typeof BlockTags)[keyof typeof BlockTags]
