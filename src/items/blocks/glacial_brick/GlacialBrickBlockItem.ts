import { BlockItem } from '../../BlockItem.ts'

/**
 * Glacial Brick block item.
 */
export class GlacialBrickBlockItem extends BlockItem {
  readonly id = 'glacial_brick_block'
  readonly name = 'glacial_brick_block'
  readonly blockName = 'glacial_brick'

  override get displayName(): string {
    return 'Glacial Brick'
  }
}
