import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

export class RedwoodLogBlockItem extends BlockItem {
  readonly id = 'redwood_log_block'
  readonly name = 'redwood_log_block'
  readonly blockName = 'redwood_log'

  override get displayName(): string {
    return 'Redwood Log'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD, ItemTags.LOG]
  }
}
