import { BlockItem } from '../../BlockItem.ts'

/**
 * Frosted Glacial Brick block item.
 */
export class FrostedGlacialBrickBlockItem extends BlockItem {
  readonly id = 'frosted_glacial_brick_block'
  readonly name = 'frosted_glacial_brick_block'
  readonly blockName = 'frosted_glacial_brick'

  override get displayName(): string {
    return 'Frosted Glacial Brick'
  }
}
