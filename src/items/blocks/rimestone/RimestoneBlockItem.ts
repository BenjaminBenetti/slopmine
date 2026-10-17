import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Rimestone block item.
 */
export class RimestoneBlockItem extends BlockItem {
  readonly id = 'rimestone_block'
  readonly name = 'rimestone_block'
  readonly blockName = 'rimestone'

  override get displayName(): string {
    return 'Rimestone'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
