import { BlockItem } from '../../BlockItem.ts'
import wheat1TexUrl from '../../../world/blocks/types/wheat/assets/wheat-1.webp'

/**
 * Wheat seedling block item for placing stage 1 wheat.
 */
export class Wheat1BlockItem extends BlockItem {
  readonly id = 'wheat_1_block'
  readonly name = 'wheat_1_block'
  readonly blockName = 'wheat_1'

  override get displayName(): string {
    return 'Wheat Seeds'
  }

  override get iconUrl(): string | undefined {
    return wheat1TexUrl
  }
}
