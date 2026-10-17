import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Catacomb Tile block item (Catacombs).
 */
export class CatacombTileBlockItem extends BlockItem {
  readonly id = 'catacomb_tile_block'
  readonly name = 'catacomb_tile_block'
  readonly blockName = 'catacomb_tile'

  override get displayName(): string {
    return 'Catacomb Tile'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
