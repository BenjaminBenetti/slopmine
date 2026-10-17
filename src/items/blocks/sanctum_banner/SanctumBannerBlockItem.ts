import { BlockItem } from '../../BlockItem.ts'

/** Sanctum Banner block item (Prism Sanctum). */
export class SanctumBannerBlockItem extends BlockItem {
  readonly id = 'sanctum_banner_block'
  readonly name = 'sanctum_banner_block'
  readonly blockName = 'sanctum_banner'

  override get displayName(): string {
    return 'Sanctum Banner'
  }
}
