import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak log block item for player inventory.
 */
export class OakLogBlockItem extends BlockItem {
  readonly id = 'oak_log_block'
  readonly name = 'oak_log_block'
  readonly blockName = 'oak_log'

  override get displayName(): string {
    return 'Oak Log'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.LOG]
  }
}
