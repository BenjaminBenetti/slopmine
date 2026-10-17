import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Banner block item (Infernal Bastion).
 */
export class InfernalBannerBlockItem extends BlockItem {
  readonly id = 'infernal_banner_block'
  readonly name = 'infernal_banner_block'
  readonly blockName = 'infernal_banner'

  override get displayName(): string {
    return 'Infernal Banner'
  }
}
