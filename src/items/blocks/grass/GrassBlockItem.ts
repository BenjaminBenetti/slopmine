import { Item } from '../../Item.ts'

/**
 * Grass block item for player inventory.
 */
export class GrassBlockItem extends Item {
  readonly id = 'grass_block'
  readonly name = 'grass_block'

  override get displayName(): string {
    return 'Grass Block'
  }
}

