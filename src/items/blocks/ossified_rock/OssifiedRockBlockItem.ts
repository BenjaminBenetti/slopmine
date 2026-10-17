import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Ossified rock block item - fossil stone of the Ossuary.
 */
export class OssifiedRockBlockItem extends BlockItem {
  readonly id = 'ossified_rock_block'
  readonly name = 'ossified_rock_block'
  readonly blockName = 'ossified_rock'

  override get displayName(): string {
    return 'Ossified Rock'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
