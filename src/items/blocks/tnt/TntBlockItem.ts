import { BlockItem } from '../../BlockItem.ts'

/**
 * TNT block item for player inventory.
 */
export class TntBlockItem extends BlockItem {
  readonly id = 'tnt_block'
  readonly name = 'tnt_block'
  readonly blockName = 'tnt'

  override get displayName(): string {
    return 'TNT'
  }
}
