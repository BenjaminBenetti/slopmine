import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Coal block item for player inventory.
 */
export class CoalBlockItem extends BlockItem {
  readonly id = 'coal_block'
  readonly name = 'coal_block'
  readonly blockName = 'coal_block'

  override get displayName(): string {
    return 'Coal Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
