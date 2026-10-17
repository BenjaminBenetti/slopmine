import { BlockItem } from '../../BlockItem.ts'

/**
 * Glacial Ice block item.
 */
export class GlacialIceBlockItem extends BlockItem {
  readonly id = 'glacial_ice_block'
  readonly name = 'glacial_ice_block'
  readonly blockName = 'glacial_ice'

  override get displayName(): string {
    return 'Glacial Ice'
  }
}
