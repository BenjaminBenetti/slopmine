import { BlockItem } from '../../BlockItem.ts'

/**
 * Glacial Brick Stairs block item.
 */
export class GlacialBrickStairsBlockItem extends BlockItem {
  readonly id = 'glacial_brick_stairs_block'
  readonly name = 'glacial_brick_stairs_block'
  readonly blockName = 'glacial_brick_stairs'

  override get displayName(): string {
    return 'Glacial Brick Stairs'
  }
}
