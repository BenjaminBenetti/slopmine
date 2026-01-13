import { BlockItem } from '../../BlockItem.ts'

/**
 * Oak leaves block item for player inventory.
 */
export class OakLeavesBlockItem extends BlockItem {
  readonly id = 'oak_leaves_block'
  readonly name = 'oak_leaves_block'
  readonly blockName = 'oak_leaves'

  override get displayName(): string {
    return 'Oak Leaves'
  }
}
