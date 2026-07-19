import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood shelf block item for player inventory.
 * Can be placed on a wall to create a 3-slot display shelf.
 */
export class RedwoodShelfBlockItem extends BlockItem {
  readonly id = 'redwood_shelf_block'
  readonly name = 'redwood_shelf_block'
  readonly blockName = 'redwood_shelf'

  override get displayName(): string {
    return 'Redwood Shelf'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
