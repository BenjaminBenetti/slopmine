import { BlockItem } from '../../BlockItem.ts'

export class PineNeedlesBlockItem extends BlockItem {
  readonly id = 'pine_needles_block'
  readonly name = 'pine_needles_block'
  readonly blockName = 'pine_needles'

  override get displayName(): string {
    return 'Pine Needles'
  }
}
