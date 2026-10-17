import { BlockItem } from '../../BlockItem.ts'

/**
 * Soul Candelabra block item (Catacombs).
 */
export class SoulCandelabraBlockItem extends BlockItem {
  readonly id = 'soul_candelabra_block'
  readonly name = 'soul_candelabra_block'
  readonly blockName = 'soul_candelabra'

  override get displayName(): string {
    return 'Soul Candelabra'
  }
}
