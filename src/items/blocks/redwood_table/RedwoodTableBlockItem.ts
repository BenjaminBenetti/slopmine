import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood table block item for player inventory.
 */
export class RedwoodTableBlockItem extends BlockItem {
  readonly id = 'redwood_table_block'
  readonly name = 'redwood_table_block'
  readonly blockName = 'redwood_table'

  override get displayName(): string {
    return 'Redwood Table'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
