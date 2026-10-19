import { BlockItem } from '../../BlockItem.ts'

export class FoxfireMushroomBlockItem extends BlockItem {
  readonly id = 'foxfire_mushroom_block'
  readonly name = 'foxfire_mushroom_block'
  readonly blockName = 'foxfire_mushroom'

  override get displayName(): string {
    return 'Foxfire Mushroom'
  }
}
