import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Copper block item for player inventory.
 */
export class CopperBlockItem extends BlockItem {
  readonly id = 'copper_block'
  readonly name = 'copper_block'
  readonly blockName = 'copper_block'

  override get displayName(): string {
    return 'Copper Block'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
