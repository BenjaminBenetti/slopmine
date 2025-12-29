import { Item } from '../../Item.ts'

/**
 * Dirt block item for player inventory.
 */
export class DirtBlockItem extends Item {
  readonly id = 'dirt_block'
  readonly name = 'dirt_block'

  override get displayName(): string {
    return 'Dirt Block'
  }
}

