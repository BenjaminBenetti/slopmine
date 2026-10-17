import { BlockItem } from '../../BlockItem.ts'

/**
 * Crypt Grate block item (Catacombs).
 */
export class CryptGrateBlockItem extends BlockItem {
  readonly id = 'crypt_grate_block'
  readonly name = 'crypt_grate_block'
  readonly blockName = 'crypt_grate'

  override get displayName(): string {
    return 'Crypt Grate'
  }
}
