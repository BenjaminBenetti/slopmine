import type { IItem } from './Item.ts'

/**
 * Represents a crafting recipe.
 * A recipe consists of a list of ingredient lists (each representing one slot)
 * and produces a single output item.
 */
export interface IRecipe {
  /** The item this recipe produces */
  readonly output: IItem
  /** 
   * List of ingredient lists. Each inner list represents acceptable items for one input slot.
   * Example: [[dirtItem], [stoneItem]] means slot 1 needs dirt, slot 2 needs stone.
   */
  readonly ingredients: ReadonlyArray<ReadonlyArray<IItem>>
}
