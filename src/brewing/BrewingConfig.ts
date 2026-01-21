// Reuse fuel burn times from smelting - brewing uses the same fuel system
export { FUEL_VALUES, getFuelValue, isFuel } from '../smelting/SmeltingConfig.ts'

/**
 * Default brew time in seconds if not specified by recipe.
 */
export const DEFAULT_BREW_TIME = 10.0

/**
 * Maximum number of ingredient slots in a brewing station.
 */
export const MAX_INGREDIENT_SLOTS = 4
