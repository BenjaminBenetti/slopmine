import { BlockItem } from '../../BlockItem.ts'

/**
 * Cracked Infernal Bricks block item.
 */
export class CrackedInfernalBricksBlockItem extends BlockItem {
  readonly id = 'cracked_infernal_bricks_block'
  readonly name = 'cracked_infernal_bricks_block'
  readonly blockName = 'cracked_infernal_bricks'

  override get displayName(): string {
    return 'Cracked Infernal Bricks'
  }
}
