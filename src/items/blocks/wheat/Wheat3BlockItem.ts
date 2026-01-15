import { BlockItem } from '../../BlockItem.ts'
import wheat3TexUrl from '../../../world/blocks/types/wheat/assets/wheat-3.webp'

/**
 * Mature wheat block item for placing stage 3 wheat.
 */
export class Wheat3BlockItem extends BlockItem {
  readonly id = 'wheat_3_block'
  readonly name = 'wheat_3_block'
  readonly blockName = 'wheat_3'

  override get displayName(): string {
    return 'Mature Wheat'
  }

  override get iconUrl(): string | undefined {
    return wheat3TexUrl
  }
}
