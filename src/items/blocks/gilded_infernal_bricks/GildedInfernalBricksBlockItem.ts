import { BlockItem } from '../../BlockItem.ts'

/**
 * Gilded Infernal Bricks block item (Infernal Bastion).
 */
export class GildedInfernalBricksBlockItem extends BlockItem {
  readonly id = 'gilded_infernal_bricks_block'
  readonly name = 'gilded_infernal_bricks_block'
  readonly blockName = 'gilded_infernal_bricks'

  override get displayName(): string {
    return 'Gilded Infernal Bricks'
  }
}
