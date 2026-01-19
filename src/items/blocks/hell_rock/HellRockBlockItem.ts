import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Hell Rock block item for player inventory.
 */
export class HellRockBlockItem extends BlockItem {
  readonly id = 'hell_rock_block'
  readonly name = 'hell_rock_block'
  readonly blockName = 'hell_rock'

  override get displayName(): string {
    return 'Hell Rock'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
