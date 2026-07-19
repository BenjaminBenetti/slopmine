import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Redwood trapdoor block item for the player inventory.
 * Places the closed REDWOOD_TRAPDOOR block; both closed and open
 * trapdoor variants drop this item.
 */
export class RedwoodTrapdoorBlockItem extends BlockItem {
  readonly id = 'redwood_trapdoor_block'
  readonly name = 'redwood_trapdoor_block'
  readonly blockName = 'redwood_trapdoor'

  override get displayName(): string {
    return 'Redwood Trapdoor'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
