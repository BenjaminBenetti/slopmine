import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Gold block item for player inventory.
 */
export class GoldBlockItem extends BlockItem {
  readonly id = 'gold_block'
  readonly name = 'gold_block'
  readonly blockName = 'gold_block'

  override get displayName(): string {
    return 'Gold Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
