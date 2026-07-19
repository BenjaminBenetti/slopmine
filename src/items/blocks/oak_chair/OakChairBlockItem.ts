import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Oak chair block item for the player inventory.
 */
export class OakChairBlockItem extends BlockItem {
  readonly id = 'oak_chair_block'
  readonly name = 'oak_chair_block'
  readonly blockName = 'oak_chair'

  override get displayName(): string {
    return 'Oak Chair'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
