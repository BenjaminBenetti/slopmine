import { BlockItem } from '../../BlockItem.ts'

/**
 * Magma Bricks block item (Infernal Bastion).
 */
export class MagmaBricksBlockItem extends BlockItem {
  readonly id = 'magma_bricks_block'
  readonly name = 'magma_bricks_block'
  readonly blockName = 'magma_bricks'

  override get displayName(): string {
    return 'Magma Bricks'
  }
}
