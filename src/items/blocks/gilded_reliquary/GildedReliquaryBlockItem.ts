import { BlockItem } from '../../BlockItem.ts'

/**
 * Gilded Reliquary block item (Catacombs).
 */
export class GildedReliquaryBlockItem extends BlockItem {
  readonly id = 'gilded_reliquary_block'
  readonly name = 'gilded_reliquary_block'
  readonly blockName = 'gilded_reliquary'

  override get displayName(): string {
    return 'Gilded Reliquary'
  }
}
