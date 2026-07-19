import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak slab block item for player inventory.
 */
export class OakSlabBlockItem extends BlockItem {
  readonly id = 'oak_slab_block'
  readonly name = 'oak_slab_block'
  readonly blockName = 'oak_slab'

  override get displayName(): string {
    return 'Oak Slab'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
