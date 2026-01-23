import { BlockItem } from '../../BlockItem.ts'

/**
 * Rope ladder block item for player inventory.
 * Crafted from rope and wood.
 */
export class RopeLadderBlockItem extends BlockItem {
  readonly id = 'rope_ladder_block'
  readonly name = 'rope_ladder_block'
  readonly blockName = 'rope_ladder'

  override get displayName(): string {
    return 'Rope Ladder'
  }
}
