import { BlockItem } from '../../BlockItem.ts'

/**
 * Crypt Altar block item (Catacombs).
 */
export class CryptAltarBlockItem extends BlockItem {
  readonly id = 'crypt_altar_block'
  readonly name = 'crypt_altar_block'
  readonly blockName = 'crypt_altar'

  override get displayName(): string {
    return 'Crypt Altar'
  }
}
