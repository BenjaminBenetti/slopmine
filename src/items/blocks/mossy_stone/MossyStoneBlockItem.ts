import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

export class MossyStoneBlockItem extends BlockItem {
  readonly id = 'mossy_stone_block'
  readonly name = 'mossy_stone_block'
  readonly blockName = 'mossy_stone'

  override get displayName(): string {
    return 'Mossy Stone'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
