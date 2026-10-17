import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Brick Stairs block item (Infernal Bastion).
 */
export class InfernalBrickStairsBlockItem extends BlockItem {
  readonly id = 'infernal_brick_stairs_block'
  readonly name = 'infernal_brick_stairs_block'
  readonly blockName = 'infernal_brick_stairs'

  override get displayName(): string {
    return 'Infernal Brick Stairs'
  }
}
