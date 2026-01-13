import { BlockItem } from '../../BlockItem.ts'

/**
 * Magma block item for player inventory.
 */
export class MagmaBlockItem extends BlockItem {
  readonly id = 'magma_block'
  readonly name = 'magma_block'
  readonly blockName = 'magma'

  override get displayName(): string {
    return 'Magma Block'
  }
}
