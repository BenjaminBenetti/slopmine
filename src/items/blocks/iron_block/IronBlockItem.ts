import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Iron block item for player inventory.
 */
export class IronBlockItem extends BlockItem {
  readonly id = 'iron_block'
  readonly name = 'iron_block'
  readonly blockName = 'iron_block'

  override get displayName(): string {
    return 'Iron Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
