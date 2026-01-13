import { BlockItem } from '../../BlockItem.ts'

export class PurpleMushroomBlockItem extends BlockItem {
  readonly id = 'purple_mushroom_block'
  readonly name = 'purple_mushroom_block'
  readonly blockName = 'purple_mushroom'

  override get displayName(): string {
    return 'Purple Mushroom'
  }
}
