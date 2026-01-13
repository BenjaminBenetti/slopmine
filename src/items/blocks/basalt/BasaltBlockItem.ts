import { BlockItem } from '../../BlockItem.ts'

/**
 * Basalt block item for player inventory.
 */
export class BasaltBlockItem extends BlockItem {
  readonly id = 'basalt_block'
  readonly name = 'basalt_block'
  readonly blockName = 'basalt'

  override get displayName(): string {
    return 'Basalt Block'
  }
}
