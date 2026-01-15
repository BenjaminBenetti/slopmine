import { BlockItem } from '../../BlockItem.ts'
import wheat2TexUrl from '../../../world/blocks/types/wheat/assets/wheat-2.webp'

/**
 * Growing wheat block item for placing stage 2 wheat.
 */
export class Wheat2BlockItem extends BlockItem {
  readonly id = 'wheat_2_block'
  readonly name = 'wheat_2_block'
  readonly blockName = 'wheat_2'

  override get displayName(): string {
    return 'Growing Wheat'
  }

  override get iconUrl(): string | undefined {
    return wheat2TexUrl
  }
}
