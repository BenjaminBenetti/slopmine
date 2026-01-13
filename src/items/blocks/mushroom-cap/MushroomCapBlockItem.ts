import { BlockItem } from '../../BlockItem.ts'

/**
 * Mushroom cap block item for player inventory.
 */
export class MushroomCapBlockItem extends BlockItem {
  readonly id = 'mushroom_cap_block'
  readonly name = 'mushroom_cap_block'
  readonly blockName = 'mushroom_cap'

  override get displayName(): string {
    return 'Mushroom Cap'
  }
}
