import { BlockItem } from '../../BlockItem.ts'

/**
 * Grave Candles block item (Catacombs).
 */
export class GraveCandlesBlockItem extends BlockItem {
  readonly id = 'grave_candles_block'
  readonly name = 'grave_candles_block'
  readonly blockName = 'grave_candles'

  override get displayName(): string {
    return 'Grave Candles'
  }
}
