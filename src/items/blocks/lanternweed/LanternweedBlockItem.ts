import { BlockItem } from '../../BlockItem.ts'

export class LanternweedBlockItem extends BlockItem {
  readonly id = 'lanternweed_block'
  readonly name = 'lanternweed_block'
  readonly blockName = 'lanternweed'

  override get displayName(): string {
    return 'Lanternweed'
  }
}
