/**
 * Fuel values for smelting.
 * Value represents the number of items that can be smelted with one fuel item.
 */
export const FUEL_VALUES: Record<string, number> = {
  coal: 8.0, // 8 items per coal
  oak_log_block: 1.5, // 1.5 items per log
}

/**
 * Default smelt time in seconds if not specified by recipe.
 */
export const DEFAULT_SMELT_TIME = 10.0

/**
 * Get the fuel value for an item ID.
 * Returns 0 if the item is not a valid fuel.
 */
export function getFuelValue(itemId: string): number {
  return FUEL_VALUES[itemId] ?? 0
}

/**
 * Check if an item can be used as fuel.
 */
export function isFuel(itemId: string): boolean {
  return getFuelValue(itemId) > 0
}
