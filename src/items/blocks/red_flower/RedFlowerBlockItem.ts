import { BlockItem } from '../../BlockItem.ts'

/**
 * Red flower block item for player inventory.
 */
export class RedFlowerBlockItem extends BlockItem {
  readonly id = 'red_flower_block'
  readonly name = 'red_flower_block'
  readonly blockName = 'red_flower'

  override get displayName(): string {
    return 'Red Flower'
  }
}
