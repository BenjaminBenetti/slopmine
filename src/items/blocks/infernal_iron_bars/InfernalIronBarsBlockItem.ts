import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Iron Bars block item (Infernal Bastion).
 */
export class InfernalIronBarsBlockItem extends BlockItem {
  readonly id = 'infernal_iron_bars_block'
  readonly name = 'infernal_iron_bars_block'
  readonly blockName = 'infernal_iron_bars'

  override get displayName(): string {
    return 'Infernal Iron Bars'
  }
}
