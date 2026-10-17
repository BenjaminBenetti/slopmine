import { BlockItem } from '../../BlockItem.ts'

/**
 * Frozen Banner block item.
 */
export class FrozenBannerBlockItem extends BlockItem {
  readonly id = 'frozen_banner_block'
  readonly name = 'frozen_banner_block'
  readonly blockName = 'frozen_banner'

  override get displayName(): string {
    return 'Frozen Banner'
  }
}
