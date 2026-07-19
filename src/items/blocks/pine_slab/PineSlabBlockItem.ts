import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine slab block item for player inventory.
 */
export class PineSlabBlockItem extends BlockItem {
  readonly id = 'pine_slab_block'
  readonly name = 'pine_slab_block'
  readonly blockName = 'pine_slab'

  override get displayName(): string {
    return 'Pine Slab'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
