import { BlockItem } from '../../BlockItem.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Cracked Catacomb Brick block item (Catacombs).
 */
export class CrackedCatacombBrickBlockItem extends BlockItem {
  readonly id = 'cracked_catacomb_brick_block'
  readonly name = 'cracked_catacomb_brick_block'
  readonly blockName = 'cracked_catacomb_brick'

  override get displayName(): string {
    return 'Cracked Catacomb Brick'
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}
