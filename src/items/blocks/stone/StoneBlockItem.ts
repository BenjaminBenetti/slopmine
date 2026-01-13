import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Stone block item for player inventory.
 */
export class StoneBlockItem extends BlockItem {
  readonly id = 'stone_block'
  readonly name = 'stone_block'
  readonly blockName = 'stone'

  override get displayName(): string {
    return 'Stone Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}

