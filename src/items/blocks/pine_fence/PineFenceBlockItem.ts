import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Pine fence block item for player inventory.
 */
export class PineFenceBlockItem extends BlockItem {
  readonly id = 'pine_fence_block'
  readonly name = 'pine_fence_block'
  readonly blockName = 'pine_fence'

  override get displayName(): string {
    return 'Pine Fence'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
