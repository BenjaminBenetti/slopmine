/**
 * Stats for tools that affect mining.
 */
export interface IToolStats {
  /** Minimum force level to mine blocks (0 = can only mine soft blocks) */
  readonly demolitionForce: number
  /** Base damage per second dealt to blocks */
  readonly damage: number
  /** Damage multipliers for specific block tags */
  readonly damageMultipliers: ReadonlyMap<string, number>
}

/**
 * Default hand stats when no tool is equipped.
 */
export const HAND_STATS: IToolStats = {
  demolitionForce: 0,
  damage: 1,
  damageMultipliers: new Map(),
}

/**
 * Type guard to check if an item has tool stats.
 */
export function hasToolStats(item: unknown): item is { toolStats: IToolStats } {
  return (
    item !== null &&
    typeof item === 'object' &&
    'toolStats' in item &&
    typeof (item as { toolStats: unknown }).toolStats === 'object'
  )
}
