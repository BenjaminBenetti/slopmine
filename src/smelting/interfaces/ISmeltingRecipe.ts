import type { IItem } from '../../items/Item.ts'

/**
 * A smelting recipe definition.
 * Converts input items into output items using fuel.
 */
export interface ISmeltingRecipe {
  /** Unique identifier */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /** Input item ID that can be smelted */
  readonly inputId: string

  /** Factory to create result item */
  readonly createResult: () => IItem

  /** Number of result items produced per input */
  readonly resultCount: number

  /** Smelting time in seconds */
  readonly smeltTime: number
}
