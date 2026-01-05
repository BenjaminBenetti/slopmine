import { Item } from '../Item.ts'
import type { IToolStats } from '../interfaces/IToolStats.ts'

/**
 * Base class for all tool items.
 * Tools cannot be stacked in inventory and have mining stats.
 */
export abstract class ToolItem extends Item {
  override get maxStackSize(): number {
    return 1
  }

  /** Tool stats for mining calculations */
  abstract readonly toolStats: IToolStats
}
