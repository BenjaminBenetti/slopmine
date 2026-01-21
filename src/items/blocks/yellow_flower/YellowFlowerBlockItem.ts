import { BlockItem } from '../../BlockItem.ts'

/**
 * Yellow flower block item for player inventory.
 */
export class YellowFlowerBlockItem extends BlockItem {
  readonly id = 'yellow_flower_block'
  readonly name = 'yellow_flower_block'
  readonly blockName = 'yellow_flower'

  override get displayName(): string {
    return 'Yellow Flower'
  }
}
