import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Oak log block item for player inventory.
 */
export class OakLogBlockItem extends Item {
  readonly id = 'oak_log_block'
  readonly name = 'oak_log_block'

  override get displayName(): string {
    return 'Oak Log'
  }

  override get iconUrl(): string {
    return new URL('./assets/oak-log-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.WOOD]
  }
}
