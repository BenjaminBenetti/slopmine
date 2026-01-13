import { BlockItem } from '../../BlockItem.ts'

export class PurpleMushroomCapBlockItem extends BlockItem {
  readonly id = 'purple_mushroom_cap_block'
  readonly name = 'purple_mushroom_cap_block'
  readonly blockName = 'purple_mushroom_cap'

  override get displayName(): string {
    return 'Purple Mushroom Cap'
  }
}
