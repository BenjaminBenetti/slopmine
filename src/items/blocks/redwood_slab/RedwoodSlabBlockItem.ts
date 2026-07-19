import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood slab block item for player inventory.
 */
export class RedwoodSlabBlockItem extends BlockItem {
  readonly id = 'redwood_slab_block'
  readonly name = 'redwood_slab_block'
  readonly blockName = 'redwood_slab'

  override get displayName(): string {
    return 'Redwood Slab'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
