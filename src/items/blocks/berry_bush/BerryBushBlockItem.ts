import { BlockItem } from '../../BlockItem.ts'

/**
 * Berry bush block item for player inventory.
 * Places a picked-clean BERRY_BUSH that regrows berries over time
 * (id ends in "_block" so BlockPlacement resolves the block by name).
 */
export class BerryBushBlockItem extends BlockItem {
  readonly id = 'berry_bush_block'
  readonly name = 'berry_bush_block'
  readonly blockName = 'berry_bush'

  override get displayName(): string {
    return 'Berry Bush'
  }
}
