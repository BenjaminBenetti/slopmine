import { BlockItem } from '../../BlockItem.ts'

export class BlueMushroomBlockItem extends BlockItem {
  readonly id = 'blue_mushroom_block'
  readonly name = 'blue_mushroom_block'
  readonly blockName = 'blue_mushroom'

  override get displayName(): string {
    return 'Blue Mushroom'
  }
}
