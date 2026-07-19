import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Oak trapdoor block item for the player inventory.
 * Places the closed OAK_TRAPDOOR block; both closed and open
 * trapdoor variants drop this item.
 */
export class OakTrapdoorBlockItem extends BlockItem {
  readonly id = 'oak_trapdoor_block'
  readonly name = 'oak_trapdoor_block'
  readonly blockName = 'oak_trapdoor'

  override get displayName(): string {
    return 'Oak Trapdoor'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
