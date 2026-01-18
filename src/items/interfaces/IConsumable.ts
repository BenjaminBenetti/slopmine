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
   * Called when consumption is completed.
   * Implement to apply effects (healing, buffs, etc.).
   * @param playerHealth - The player's health system for healing
   */
  onConsume(playerHealth: IPlayerHealth): void
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
