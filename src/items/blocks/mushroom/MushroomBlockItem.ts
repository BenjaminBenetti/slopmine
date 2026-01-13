import { BlockItem } from '../../BlockItem.ts'

/**
 * Mushroom block item for player inventory.
 */
export class MushroomBlockItem extends BlockItem {
  readonly id = 'mushroom_block'
  readonly name = 'mushroom_block'
  readonly blockName = 'mushroom'

  override get displayName(): string {
    return 'Mushroom Block'
  }
}
