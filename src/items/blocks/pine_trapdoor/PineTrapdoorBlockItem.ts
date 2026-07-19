import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Pine trapdoor block item for the player inventory.
 * Places the closed PINE_TRAPDOOR block; both closed and open
 * trapdoor variants drop this item.
 */
export class PineTrapdoorBlockItem extends BlockItem {
  readonly id = 'pine_trapdoor_block'
  readonly name = 'pine_trapdoor_block'
  readonly blockName = 'pine_trapdoor'

  override get displayName(): string {
    return 'Pine Trapdoor'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
