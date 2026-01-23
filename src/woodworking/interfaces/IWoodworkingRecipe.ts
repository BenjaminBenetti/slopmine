import type { IItem } from '../../items/Item.ts'

/**
 * A woodworking recipe that converts input items to output items.
 * No processing time - instant conversion when crafted.
 */
export interface IWoodworkingRecipe {
  /** Unique recipe identifier */
  readonly id: string

  /** Display name for the recipe */
  readonly name: string

  /** Input item ID required */
  readonly inputItemId: string

  /** Number of input items consumed per craft */
  readonly inputCount: number

  /** Factory function to create the result item */
  createResult(): IItem

  /** Number of result items produced per craft */
  readonly resultCount: number
}
