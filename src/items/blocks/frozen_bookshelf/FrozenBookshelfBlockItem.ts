import { BlockItem } from '../../BlockItem.ts'

/**
 * Frozen Bookshelf block item.
 */
export class FrozenBookshelfBlockItem extends BlockItem {
  readonly id = 'frozen_bookshelf_block'
  readonly name = 'frozen_bookshelf_block'
  readonly blockName = 'frozen_bookshelf'

  override get displayName(): string {
    return 'Frozen Bookshelf'
  }
}
