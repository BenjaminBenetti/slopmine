import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Pine table block item for player inventory.
 */
export class PineTableBlockItem extends BlockItem {
  readonly id = 'pine_table_block'
  readonly name = 'pine_table_block'
  readonly blockName = 'pine_table'

  override get displayName(): string {
    return 'Pine Table'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
