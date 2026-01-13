import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Sandstone block item for player inventory.
 */
export class SandstoneBlockItem extends BlockItem {
  readonly id = 'sandstone_block'
  readonly name = 'sandstone_block'
  readonly blockName = 'sandstone'

  override get displayName(): string {
    return 'Sandstone Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
