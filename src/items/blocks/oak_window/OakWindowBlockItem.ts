import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak window block item for player inventory.
 */
export class OakWindowBlockItem extends BlockItem {
  readonly id = 'oak_window_block'
  readonly name = 'oak_window_block'
  readonly blockName = 'oak_window'

  override get displayName(): string {
    return 'Oak Window'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
