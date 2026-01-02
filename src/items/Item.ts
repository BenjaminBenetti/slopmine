import type { IRecipe } from './IRecipe.ts'

/**
 * Interface for all inventory items.
 */
export interface IItem {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly maxStackSize: number
  readonly iconUrl?: string
  /**
   * Get the crafting recipe for this item, if any.
   * @returns The recipe to craft this item, or null if not craftable.
   */
  getRecipe(): IRecipe | null
}

/**
 * Base class for all inventory items.
 * Provides common functionality and default values.
 */
export abstract class Item implements IItem {
  abstract readonly id: string
  abstract readonly name: string

  /**
   * Human-readable display name. Defaults to capitalized name.
   */
  get displayName(): string {
    return this.name.charAt(0).toUpperCase() + this.name.slice(1).replace(/_/g, ' ')
  }

  /**
   * Maximum stack size for this item. Override in subclasses.
   */
  get maxStackSize(): number {
    return 64
  }

  /**
   * Optional icon URL for UI rendering.
   */
  get iconUrl(): string | undefined {
    return undefined
  }

  /**
   * Get the crafting recipe for this item, if any.
   * Override in subclasses to provide a recipe.
   * @returns The recipe to craft this item, or null if not craftable.
   */
  getRecipe(): IRecipe | null {
    return null
  }

  /**
   * Check if this item can stack with another item.
   */
  canStackWith(other: IItem): boolean {
    return this.id === other.id
  }
}
