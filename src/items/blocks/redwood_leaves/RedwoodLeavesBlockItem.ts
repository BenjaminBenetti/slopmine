import { BlockItem } from '../../BlockItem.ts'

export class RedwoodLeavesBlockItem extends BlockItem {
  readonly id = 'redwood_leaves_block'
  readonly name = 'redwood_leaves_block'
  readonly blockName = 'redwood_leaves'

  override get displayName(): string {
    return 'Redwood Leaves'
  }
}
