import { BlockItem } from '../../BlockItem.ts'

/**
 * Charred log block item for player inventory.
 */
export class CharredLogBlockItem extends BlockItem {
  readonly id = 'charred_log_block'
  readonly name = 'charred_log_block'
  readonly blockName = 'charred_log'

  override get displayName(): string {
    return 'Charred Log'
  }
}
