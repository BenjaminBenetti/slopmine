import { BlockItem } from '../../BlockItem.ts'

/** Prism Pedestal block item (Prism Sanctum). */
export class PrismPedestalBlockItem extends BlockItem {
  readonly id = 'prism_pedestal_block'
  readonly name = 'prism_pedestal_block'
  readonly blockName = 'prism_pedestal'

  override get displayName(): string {
    return 'Prism Pedestal'
  }
}
