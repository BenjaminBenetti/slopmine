import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/ItemTags.ts'

/**
 * Redwood chair block item for the player inventory.
 */
export class RedwoodChairBlockItem extends BlockItem {
  readonly id = 'redwood_chair_block'
  readonly name = 'redwood_chair_block'
  readonly blockName = 'redwood_chair'

  override get displayName(): string {
    return 'Redwood Chair'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
