import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Chest block item for player inventory.
 * Can be placed to create a chest for item storage.
 */
export class ChestBlockItem extends BlockItem {
  readonly id = 'chest_block'
  readonly name = 'chest_block'
  readonly blockName = 'chest'

  override get displayName(): string {
    return 'Chest'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
