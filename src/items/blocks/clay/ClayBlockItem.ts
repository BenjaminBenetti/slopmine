import { BlockItem } from '../../BlockItem.ts'

/**
 * Clay block item for player inventory.
 */
export class ClayBlockItem extends BlockItem {
  readonly id = 'clay_block'
  readonly name = 'clay_block'
  readonly blockName = 'clay'

  override get displayName(): string {
    return 'Clay Block'
  }
}
