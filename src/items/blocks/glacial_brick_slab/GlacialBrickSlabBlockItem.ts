import { BlockItem } from '../../BlockItem.ts'

/**
 * Glacial Brick Slab block item.
 */
export class GlacialBrickSlabBlockItem extends BlockItem {
  readonly id = 'glacial_brick_slab_block'
  readonly name = 'glacial_brick_slab_block'
  readonly blockName = 'glacial_brick_slab'

  override get displayName(): string {
    return 'Glacial Brick Slab'
  }
}
