import { BlockItem } from '../../BlockItem.ts'

/**
 * Ladder block item for player inventory.
 */
export class LadderBlockItem extends BlockItem {
  readonly id = 'ladder_block'
  readonly name = 'ladder_block'
  readonly blockName = 'ladder'

  override get displayName(): string {
    return 'Ladder'
  }
}
