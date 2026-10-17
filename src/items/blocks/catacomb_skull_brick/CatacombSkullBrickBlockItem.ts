import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Catacomb skull brick block item (mined from the Catacombs with infernium tools).
 */
export class CatacombSkullBrickBlockItem extends BlockItem {
  readonly id = 'catacomb_skull_brick_block'
  readonly name = 'catacomb_skull_brick_block'
  readonly blockName = 'catacomb_skull_brick'

  override get displayName(): string {
    return 'Catacomb Skull Brick'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
