import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Catacomb brick block item (mined from the Catacombs with infernium tools).
 */
export class CatacombBrickBlockItem extends BlockItem {
  readonly id = 'catacomb_brick_block'
  readonly name = 'catacomb_brick_block'
  readonly blockName = 'catacomb_brick'

  override get displayName(): string {
    return 'Catacomb Brick'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
