import { BlockItem } from '../../BlockItem.ts'

export class FoxfireMushroomCapBlockItem extends BlockItem {
  readonly id = 'foxfire_mushroom_cap_block'
  readonly name = 'foxfire_mushroom_cap_block'
  readonly blockName = 'foxfire_mushroom_cap'

  override get displayName(): string {
    return 'Foxfire Mushroom Cap'
  }
}
