import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

export class PineLogBlockItem extends BlockItem {
  readonly id = 'pine_log_block'
  readonly name = 'pine_log_block'
  readonly blockName = 'pine_log'

  override get displayName(): string {
    return 'Pine Log'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.LOG]
  }
}
