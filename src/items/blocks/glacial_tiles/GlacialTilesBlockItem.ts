import { BlockItem } from '../../BlockItem.ts'

/**
 * Glacial Tiles block item.
 */
export class GlacialTilesBlockItem extends BlockItem {
  readonly id = 'glacial_tiles_block'
  readonly name = 'glacial_tiles_block'
  readonly blockName = 'glacial_tiles'

  override get displayName(): string {
    return 'Glacial Tiles'
  }
}
