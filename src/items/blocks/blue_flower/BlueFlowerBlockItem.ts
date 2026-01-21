import { BlockItem } from '../../BlockItem.ts'

/**
 * Blue flower block item for player inventory.
 */
export class BlueFlowerBlockItem extends BlockItem {
  readonly id = 'blue_flower_block'
  readonly name = 'blue_flower_block'
  readonly blockName = 'blue_flower'

  override get displayName(): string {
    return 'Blue Flower'
  }
}
