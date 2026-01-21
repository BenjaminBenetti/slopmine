import { BlockItem } from '../../BlockItem.ts'
import herb1TexUrl from '../../../world/blocks/types/herb/assets/herb-1.webp'

/**
 * Herb seedling block item for placing stage 1 herb.
 */
export class Herb1BlockItem extends BlockItem {
  readonly id = 'herb_1_block'
  readonly name = 'herb_1_block'
  readonly blockName = 'herb_1'

  override get displayName(): string {
    return 'Herb Seeds'
  }

  override get iconUrl(): string | undefined {
    return herb1TexUrl
  }
}
