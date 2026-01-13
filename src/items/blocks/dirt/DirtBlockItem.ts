import { BlockItem } from '../../BlockItem.ts'

/**
 * Dirt block item for player inventory.
 */
export class DirtBlockItem extends BlockItem {
  readonly id = 'dirt_block'
  readonly name = 'dirt_block'
  readonly blockName = 'dirt'

  override get displayName(): string {
    return 'Dirt Block'
  }
}

