import { BlockItem } from '../../BlockItem.ts'

/**
 * Scorched Infernal Bricks block item (Infernal Bastion).
 */
export class ScorchedInfernalBricksBlockItem extends BlockItem {
  readonly id = 'scorched_infernal_bricks_block'
  readonly name = 'scorched_infernal_bricks_block'
  readonly blockName = 'scorched_infernal_bricks'

  override get displayName(): string {
    return 'Scorched Infernal Bricks'
  }
}
