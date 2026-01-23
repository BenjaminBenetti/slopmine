import { BlockItem } from '../../BlockItem.ts'
import hemp2TexUrl from '../../../world/blocks/types/hemp/assets/hemp-2.webp'

/**
 * Growing hemp block item for placing stage 2 hemp.
 */
export class Hemp2BlockItem extends BlockItem {
  readonly id = 'hemp_2_block'
  readonly name = 'hemp_2_block'
  readonly blockName = 'hemp_2'

  override get displayName(): string {
    return 'Growing Hemp'
  }

  override get iconUrl(): string | undefined {
    return hemp2TexUrl
  }
}
