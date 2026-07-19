import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine window block item for player inventory.
 */
export class PineWindowBlockItem extends BlockItem {
  readonly id = 'pine_window_block'
  readonly name = 'pine_window_block'
  readonly blockName = 'pine_window'

  override get displayName(): string {
    return 'Pine Window'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
