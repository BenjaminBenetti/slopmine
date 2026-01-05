import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Iron block item for player inventory.
 */
export class IronBlockItem extends Item {
  readonly id = 'iron_block'
  readonly name = 'iron_block'

  override get displayName(): string {
    return 'Iron Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL]
  }
}
