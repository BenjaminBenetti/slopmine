import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Oak fence block item for player inventory.
 */
export class OakFenceBlockItem extends BlockItem {
  readonly id = 'oak_fence_block'
  readonly name = 'oak_fence_block'
  readonly blockName = 'oak_fence'

  override get displayName(): string {
    return 'Oak Fence'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
