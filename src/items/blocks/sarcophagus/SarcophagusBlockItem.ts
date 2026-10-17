import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Sarcophagus block item - a carved limestone tomb.
 */
export class SarcophagusBlockItem extends BlockItem {
  readonly id = 'sarcophagus_block'
  readonly name = 'sarcophagus_block'
  readonly blockName = 'sarcophagus'

  override get displayName(): string {
    return 'Sarcophagus'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
