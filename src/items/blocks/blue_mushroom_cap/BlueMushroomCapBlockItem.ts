import { BlockItem } from '../../BlockItem.ts'

export class BlueMushroomCapBlockItem extends BlockItem {
  readonly id = 'blue_mushroom_cap_block'
  readonly name = 'blue_mushroom_cap_block'
  readonly blockName = 'blue_mushroom_cap'

  override get displayName(): string {
    return 'Blue Mushroom Cap'
  }
}
