import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Brick Slab block item (Infernal Bastion).
 */
export class InfernalBrickSlabBlockItem extends BlockItem {
  readonly id = 'infernal_brick_slab_block'
  readonly name = 'infernal_brick_slab_block'
  readonly blockName = 'infernal_brick_slab'

  override get displayName(): string {
    return 'Infernal Brick Slab'
  }
}
