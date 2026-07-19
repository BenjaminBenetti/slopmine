import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Redwood fence block item for player inventory.
 */
export class RedwoodFenceBlockItem extends BlockItem {
  readonly id = 'redwood_fence_block'
  readonly name = 'redwood_fence_block'
  readonly blockName = 'redwood_fence'

  override get displayName(): string {
    return 'Redwood Fence'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
