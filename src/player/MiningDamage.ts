import type { IBlock } from '../world/interfaces/IBlock.ts'
import type { IToolStats } from '../items/interfaces/IToolStats.ts'
import { HAND_STATS } from '../items/interfaces/IToolStats.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'

/** Factor to convert hardness to HP (block HP = hardness × this factor) */
const HARDNESS_TO_HP_FACTOR = 5.0

/**
 * Blocks requiring at least this much demolition force only accept force
 * from the RIGHT kind of tool: one with a damage multiplier for one of the
 * block's tags (a pickaxe for rock). Any other tool counts as at most
 * {@link OFF_TOOL_FORCE_CAP} - so a diamond shovel no longer mines obsidian,
 * and iron ore really needs a stone pickaxe.
 */
const TOOL_TYPE_RULE_MIN_FORCE = 2
const OFF_TOOL_FORCE_CAP = 1

/**
 * Material tier names by demolition force (DESIGN §4 mining force tiers):
 * wood 1 · stone 2 · iron 3 · steel 4 · diamond 5 · infernium 6 · hellbane 7.
 */
export const FORCE_TIER_NAMES: readonly string[] = [
  'bare hand',
  'wood',
  'stone',
  'iron',
  'steel',
  'diamond',
  'infernium',
  'hellbane',
]

/**
 * Result of calculating mining damage for a tool/block combination.
 */
export interface IMiningResult {
  /** Whether the block can be mined with this tool */
  canMine: boolean
  /** Effective damage per second to apply */
  damagePerSecond: number
  /** Total HP of the block */
  blockHP: number
  /** Time to mine in seconds (Infinity if cannot mine) */
  miningTime: number
}

/**
 * Whether the tool is the right kind for the block: it has a damage
 * multiplier for at least one of the block's tags (pickaxe ↔ rock,
 * axe ↔ wood, shovel ↔ soil).
 */
export function isMatchingTool(block: IBlock, toolStats: IToolStats): boolean {
  for (const tag of block.properties.tags) {
    if (toolStats.damageMultipliers.has(tag)) return true
  }
  return false
}

/**
 * The demolition force a tool brings against a block. For blocks that need
 * force 2 or more, only a matching tool (see {@link isMatchingTool}) applies
 * its full force; any other tool counts as at most force 1.
 */
export function getEffectiveDemolitionForce(block: IBlock, toolStats: IToolStats): number {
  if (block.properties.demolitionForceRequired < TOOL_TYPE_RULE_MIN_FORCE) {
    return toolStats.demolitionForce
  }
  if (isMatchingTool(block, toolStats)) return toolStats.demolitionForce
  return Math.min(toolStats.demolitionForce, OFF_TOOL_FORCE_CAP)
}

/** The tool kind that works on a block, from its tags (null: no specific tool). */
export function getToolKindForBlock(block: IBlock): 'pickaxe' | 'axe' | 'shovel' | null {
  const tags = block.properties.tags
  if (tags.includes(BlockTags.ROCK)) return 'pickaxe'
  if (tags.includes(BlockTags.WOOD)) return 'axe'
  if (tags.includes(BlockTags.SOIL)) return 'shovel'
  return null
}

/**
 * Player-facing description of the tool a block needs, e.g. "Needs a stone
 * pickaxe" or "Needs an iron pickaxe" (tier from the block's required force).
 */
export function describeRequiredTool(block: IBlock): string {
  const force = block.properties.demolitionForceRequired
  const tier = FORCE_TIER_NAMES[force]
  if (tier === undefined) return 'Too hard to mine'
  const kind = getToolKindForBlock(block)
  if (force <= 0) return kind ? `Needs a ${kind}` : 'Cannot be mined'
  if (!kind) return `Needs a ${tier} tool or better`
  const article = /^[aeiou]/.test(tier) ? 'an' : 'a'
  return `Needs ${article} ${tier} ${kind}`
}

/**
 * Calculate mining parameters for a tool vs block combination.
 *
 * @param block - The block being mined
 * @param toolStats - The tool stats (defaults to HAND_STATS if not provided)
 * @returns Mining result with canMine, damagePerSecond, blockHP, and miningTime
 */
export function calculateMiningDamage(
  block: IBlock,
  toolStats: IToolStats = HAND_STATS
): IMiningResult {
  const props = block.properties
  const blockHP = props.hardness * HARDNESS_TO_HP_FACTOR

  // Check if tool has enough demolition force (of the right kind of tool)
  if (getEffectiveDemolitionForce(block, toolStats) < props.demolitionForceRequired) {
    return {
      canMine: false,
      damagePerSecond: 0,
      blockHP,
      miningTime: Infinity,
    }
  }

  // Calculate effective damage with multipliers
  let damage = toolStats.damage
  for (const tag of props.tags) {
    const multiplier = toolStats.damageMultipliers.get(tag)
    if (multiplier !== undefined) {
      damage *= multiplier
    }
  }

  // Handle edge case of zero hardness (air, etc.)
  const miningTime = blockHP > 0 ? blockHP / damage : 0

  return {
    canMine: true,
    damagePerSecond: damage,
    blockHP,
    miningTime,
  }
}
