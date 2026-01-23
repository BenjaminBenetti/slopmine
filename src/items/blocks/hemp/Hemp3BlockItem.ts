import { BlockItem } from '../../BlockItem.ts'
import hemp3TexUrl from '../../../world/blocks/types/hemp/assets/hemp-3.webp'

/**
 * Mature hemp block item for placing stage 3 hemp.
 */
export class Hemp3BlockItem extends BlockItem {
  readonly id = 'hemp_3_block'
  readonly name = 'hemp_3_block'
  readonly blockName = 'hemp_3'

  override get displayName(): string {
    return 'Mature Hemp'
  }

  override get iconUrl(): string | undefined {
    return hemp3TexUrl
  }
}
