import { BlockItem } from '../../BlockItem.ts'

/**
 * Polished Ice block item.
 */
export class PolishedIceBlockItem extends BlockItem {
  readonly id = 'polished_ice_block'
  readonly name = 'polished_ice_block'
  readonly blockName = 'polished_ice'

  override get displayName(): string {
    return 'Polished Ice'
  }
}
