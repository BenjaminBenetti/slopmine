import { BlockItem } from '../../BlockItem.ts'

/**
 * Black Ice block item.
 */
export class BlackIceBlockItem extends BlockItem {
  readonly id = 'black_ice_block'
  readonly name = 'black_ice_block'
  readonly blockName = 'black_ice'

  override get displayName(): string {
    return 'Black Ice'
  }
}
