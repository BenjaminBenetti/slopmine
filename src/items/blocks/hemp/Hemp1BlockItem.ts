import { BlockItem } from '../../BlockItem.ts'
import hemp1TexUrl from '../../../world/blocks/types/hemp/assets/hemp-1.webp'

/**
 * Hemp seedling block item for placing stage 1 hemp.
 */
export class Hemp1BlockItem extends BlockItem {
  readonly id = 'hemp_1_block'
  readonly name = 'hemp_1_block'
  readonly blockName = 'hemp_1'

  override get displayName(): string {
    return 'Hemp Seeds'
  }

  override get iconUrl(): string | undefined {
    return hemp1TexUrl
  }
}
