import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Burial Niche block item (Catacombs).
 */
export class BurialNicheBlockItem extends BlockItem {
  readonly id = 'burial_niche_block'
  readonly name = 'burial_niche_block'
  readonly blockName = 'burial_niche'

  override get displayName(): string {
    return 'Burial Niche'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
