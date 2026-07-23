import { BlockItem } from '../../BlockItem.ts'

/**
 * Smoldering stone block item for player inventory.
 */
export class SmolderingStoneBlockItem extends BlockItem {
  readonly id = 'smoldering_stone_block'
  readonly name = 'smoldering_stone_block'
  readonly blockName = 'smoldering_stone'

  override get displayName(): string {
    return 'Smoldering Stone'
  }
}
