import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Catacomb Frieze block item (Catacombs).
 */
export class CatacombFriezeBlockItem extends BlockItem {
  readonly id = 'catacomb_frieze_block'
  readonly name = 'catacomb_frieze_block'
  readonly blockName = 'catacomb_frieze'

  override get displayName(): string {
    return 'Catacomb Frieze'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
