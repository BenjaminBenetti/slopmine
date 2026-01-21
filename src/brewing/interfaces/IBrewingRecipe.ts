import type { IItem } from '../../items/Item.ts'

/**
 * A single ingredient required for a brewing recipe.
 */
export interface IBrewingIngredient {
  /** Item ID of the ingredient */
  readonly itemId: string

  /** Number of this item required */
  readonly count: number
}

/**
 * A brewing recipe definition.
 * Converts multiple ingredients into a potion or other brewed item using fuel.
 */
export interface IBrewingRecipe {
  /** Unique identifier */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /** List of ingredients required (can have multiple of same item via count) */
  readonly ingredients: ReadonlyArray<IBrewingIngredient>

  /** Factory to create result item */
  readonly createResult: () => IItem

  /** Number of result items produced */
  readonly resultCount: number

  /** Brewing time in seconds */
  readonly brewTime: number
}
