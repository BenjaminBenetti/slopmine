import { BlockItem } from '../../BlockItem.ts'

/**
 * Frozen Magma block item.
 */
export class FrozenMagmaBlockItem extends BlockItem {
  readonly id = 'frozen_magma_block'
  readonly name = 'frozen_magma_block'
  readonly blockName = 'frozen_magma'

  override get displayName(): string {
    return 'Frozen Magma'
  }
}
