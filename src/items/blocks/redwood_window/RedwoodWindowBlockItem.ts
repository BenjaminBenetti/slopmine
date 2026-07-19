import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Redwood window block item for player inventory.
 */
export class RedwoodWindowBlockItem extends BlockItem {
  readonly id = 'redwood_window_block'
  readonly name = 'redwood_window_block'
  readonly blockName = 'redwood_window'

  override get displayName(): string {
    return 'Redwood Window'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
