import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine shelf block item for player inventory.
 * Can be placed on a wall to create a 3-slot display shelf.
 */
export class PineShelfBlockItem extends BlockItem {
  readonly id = 'pine_shelf_block'
  readonly name = 'pine_shelf_block'
  readonly blockName = 'pine_shelf'

  override get displayName(): string {
    return 'Pine Shelf'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
