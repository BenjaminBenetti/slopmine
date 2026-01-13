import { BlockItem } from '../../BlockItem.ts'

/**
 * Grass block item for player inventory.
 */
export class GrassBlockItem extends BlockItem {
  readonly id = 'grass_block'
  readonly name = 'grass_block'
  readonly blockName = 'grass'

  override get displayName(): string {
    return 'Grass Block'
  }
}

