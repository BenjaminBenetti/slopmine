import { BlockItem } from '../../BlockItem.ts'

/**
 * Carved Glacial Brick block item.
 */
export class CarvedGlacialBrickBlockItem extends BlockItem {
  readonly id = 'carved_glacial_brick_block'
  readonly name = 'carved_glacial_brick_block'
  readonly blockName = 'carved_glacial_brick'

  override get displayName(): string {
    return 'Carved Glacial Brick'
  }
}
