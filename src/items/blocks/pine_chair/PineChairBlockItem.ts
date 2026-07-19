import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Pine chair block item for the player inventory.
 */
export class PineChairBlockItem extends BlockItem {
  readonly id = 'pine_chair_block'
  readonly name = 'pine_chair_block'
  readonly blockName = 'pine_chair'

  override get displayName(): string {
    return 'Pine Chair'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
