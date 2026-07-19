import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Oak stairs block item for player inventory.
 */
export class OakStairsBlockItem extends BlockItem {
  readonly id = 'oak_stairs_block'
  readonly name = 'oak_stairs_block'
  readonly blockName = 'oak_stairs'

  override get displayName(): string {
    return 'Oak Stairs'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
