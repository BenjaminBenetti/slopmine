import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Diamond block item for player inventory.
 */
export class DiamondBlockItem extends BlockItem {
  readonly id = 'diamond_block'
  readonly name = 'diamond_block'
  readonly blockName = 'diamond_block'

  override get displayName(): string {
    return 'Diamond Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
