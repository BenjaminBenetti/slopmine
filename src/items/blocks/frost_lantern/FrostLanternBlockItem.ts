import { BlockItem } from '../../BlockItem.ts'

/**
 * Frost lantern block item.
 */
export class FrostLanternBlockItem extends BlockItem {
  readonly id = 'frost_lantern_block'
  readonly name = 'frost_lantern_block'
  readonly blockName = 'frost_lantern'

  override get displayName(): string {
    return 'Frost Lantern'
  }
}
