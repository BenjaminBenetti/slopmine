import { BlockItem } from '../../BlockItem.ts'

/**
 * Vine block item for player inventory.
 */
export class VineBlockItem extends BlockItem {
  readonly id = 'vine_block'
  readonly name = 'vine_block'
  readonly blockName = 'vine'

  override get displayName(): string {
    return 'Vine Block'
  }
}
