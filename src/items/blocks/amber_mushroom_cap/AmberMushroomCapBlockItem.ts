import { BlockItem } from '../../BlockItem.ts'

export class AmberMushroomCapBlockItem extends BlockItem {
  readonly id = 'amber_mushroom_cap_block'
  readonly name = 'amber_mushroom_cap_block'
  readonly blockName = 'amber_mushroom_cap'

  override get displayName(): string {
    return 'Amber Mushroom Cap'
  }
}
