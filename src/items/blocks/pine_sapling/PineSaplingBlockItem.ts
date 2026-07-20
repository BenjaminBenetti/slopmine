import { BlockItem } from '../../BlockItem.ts'

export class PineSaplingBlockItem extends BlockItem {
  readonly id = 'pine_sapling_block'
  readonly name = 'pine_sapling_block'
  readonly blockName = 'pine_sapling'

  override get displayName(): string {
    return 'Pine Sapling'
  }
}
