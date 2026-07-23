import { BlockItem } from '../../BlockItem.ts'

/**
 * Geyser block item for player inventory. Places the dormant GEYSER vent.
 */
export class GeyserBlockItem extends BlockItem {
  readonly id = 'geyser_block'
  readonly name = 'geyser_block'
  readonly blockName = 'geyser'

  override get displayName(): string {
    return 'Geyser'
  }
}
