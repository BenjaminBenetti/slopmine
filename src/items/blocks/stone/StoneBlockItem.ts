import { Item } from '../../Item.ts'

/**
 * Stone block item for player inventory.
 */
export class StoneBlockItem extends Item {
  readonly id = 'stone_block'
  readonly name = 'stone_block'

  override get displayName(): string {
    return 'Stone Block'
  }
}

