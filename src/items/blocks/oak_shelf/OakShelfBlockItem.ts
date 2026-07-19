import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak shelf block item for player inventory.
 * Can be placed on a wall to create a 3-slot display shelf.
 */
export class OakShelfBlockItem extends BlockItem {
  readonly id = 'oak_shelf_block'
  readonly name = 'oak_shelf_block'
  readonly blockName = 'oak_shelf'

  override get displayName(): string {
    return 'Oak Shelf'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
