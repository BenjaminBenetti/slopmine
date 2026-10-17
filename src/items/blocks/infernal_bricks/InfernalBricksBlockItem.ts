import { BlockItem } from '../../BlockItem.ts'

/**
 * Infernal Bricks block item. Places the player-grade brick block (normal
 * force); the Infernal Bastion's force-6 walls drop this item when mined.
 */
export class InfernalBricksBlockItem extends BlockItem {
  readonly id = 'infernal_bricks_block'
  readonly name = 'infernal_bricks_block'
  readonly blockName = 'crafted_infernal_bricks'

  override get displayName(): string {
    return 'Infernal Bricks'
  }
}
