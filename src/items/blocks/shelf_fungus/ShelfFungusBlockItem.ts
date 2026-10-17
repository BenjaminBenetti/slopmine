import { BlockItem } from '../../BlockItem.ts'

export class ShelfFungusBlockItem extends BlockItem {
  readonly id = 'shelf_fungus_block'
  readonly name = 'shelf_fungus_block'
  readonly blockName = 'shelf_fungus'

  override get displayName(): string {
    return 'Shelf Fungus'
  }
}
