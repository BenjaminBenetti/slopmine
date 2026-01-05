import type { IBlock } from '../world/interfaces/IBlock.ts'
import type { IToolStats } from '../items/interfaces/IToolStats.ts'
import { HAND_STATS } from '../items/interfaces/IToolStats.ts'

/** Factor to convert hardness to HP (block HP = hardness × this factor) */
const HARDNESS_TO_HP_FACTOR = 5.0

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

  // Check if tool has enough demolition force
  if (toolStats.demolitionForce < props.demolitionForceRequired) {
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
