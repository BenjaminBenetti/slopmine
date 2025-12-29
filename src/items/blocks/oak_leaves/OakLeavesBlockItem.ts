import { Item } from '../../Item.ts'

/**
 * Oak leaves block item for player inventory.
 */
export class OakLeavesBlockItem extends Item {
  readonly id = 'oak_leaves_block'
  readonly name = 'oak_leaves_block'

  override get displayName(): string {
    return 'Oak Leaves'
  }
}
