import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak table block item for player inventory.
 */
export class OakTableBlockItem extends BlockItem {
  readonly id = 'oak_table_block'
  readonly name = 'oak_table_block'
  readonly blockName = 'oak_table'

  override get displayName(): string {
    return 'Oak Table'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
