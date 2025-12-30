import { Item } from '../Item.ts'

/**
 * Base class for all tool items.
 * Tools cannot be stacked in inventory.
 */
export abstract class ToolItem extends Item {
  override get maxStackSize(): number {
    return 1
  }
}
