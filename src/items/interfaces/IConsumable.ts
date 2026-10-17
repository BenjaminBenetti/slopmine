import type { IPlayerHealth } from '../../player/PlayerHealth.ts'

/**
 * Stats for consumable items.
 */
export interface IConsumableStats {
  /** Time in seconds to consume the item (default: 2.0) */
  readonly consumeTime: number
}

/**
 * Interface for items that can be consumed (eaten, drunk, etc.).
 */
export interface IConsumable {
  /** Consumable stats for this item */
  readonly consumableStats: IConsumableStats

  /**
   * Optional gate, checked when consumption would start: return false to
   * refuse (the item is kept; tell the player why, e.g. a capped Infernal
   * Heart). Omitted = always consumable.
   */
  canConsume?(playerHealth: IPlayerHealth): boolean

  /**
   * Called when consumption is completed.
   * Implement to apply effects (healing, buffs, etc.).
   * @param playerHealth - The player's health system for healing
   */
  onConsume(playerHealth: IPlayerHealth): void

  /**
   * Reusable items (e.g. the Return Idol) set this to false: using one keeps
   * the stack. Default (omitted): consumed.
   */
  readonly consumedOnUse?: boolean

  /**
   * Optional gate, checked every tick while the use button is held: false
   * cancels the use (e.g. on cooldown, interrupted). Default: always usable.
   * (canConsume is the one-shot gate when a use would start.)
   */
  canContinueUse?(): boolean
}

/**
 * Default consumable stats.
 */
export const DEFAULT_CONSUMABLE_STATS: IConsumableStats = {
  consumeTime: 2.0,
}

/**
 * Type guard to check if an item is consumable.
 */
export function isConsumable(item: unknown): item is IConsumable {
  return (
    item !== null &&
    typeof item === 'object' &&
    'consumableStats' in item &&
    typeof (item as { consumableStats: unknown }).consumableStats === 'object' &&
    'onConsume' in item &&
    typeof (item as { onConsume: unknown }).onConsume === 'function'
  )
}
