import { BlockItem } from '../../BlockItem.ts'

export class GillWallBlockItem extends BlockItem {
  readonly id = 'gill_wall_block'
  readonly name = 'gill_wall_block'
  readonly blockName = 'gill_wall'

  override get displayName(): string {
    return 'Gill Wall'
  }
}
