import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Pine stairs block item for player inventory.
 */
export class PineStairsBlockItem extends BlockItem {
  readonly id = 'pine_stairs_block'
  readonly name = 'pine_stairs_block'
  readonly blockName = 'pine_stairs'

  override get displayName(): string {
    return 'Pine Stairs'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
