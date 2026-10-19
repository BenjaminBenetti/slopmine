import { BlockItem } from '../../BlockItem.ts'

export class AmberMushroomBlockItem extends BlockItem {
  readonly id = 'amber_mushroom_block'
  readonly name = 'amber_mushroom_block'
  readonly blockName = 'amber_mushroom'

  override get displayName(): string {
    return 'Amber Mushroom'
  }
}
