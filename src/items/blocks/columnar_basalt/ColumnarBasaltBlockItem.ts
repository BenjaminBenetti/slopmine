import { BlockItem } from '../../BlockItem.ts'

/**
 * Columnar basalt block item for player inventory.
 */
export class ColumnarBasaltBlockItem extends BlockItem {
  readonly id = 'columnar_basalt_block'
  readonly name = 'columnar_basalt_block'
  readonly blockName = 'columnar_basalt'

  override get displayName(): string {
    return 'Columnar Basalt'
  }
}
