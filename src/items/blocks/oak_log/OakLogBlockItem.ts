import { Item } from '../../Item.ts'

/**
 * Oak log block item for player inventory.
 */
export class OakLogBlockItem extends Item {
  readonly id = 'oak_log_block'
  readonly name = 'oak_log_block'

  override get displayName(): string {
    return 'Oak Log'
  }
}
