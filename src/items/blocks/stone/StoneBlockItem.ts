import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Stone block item for player inventory.
 */
export class StoneBlockItem extends Item {
  readonly id = 'stone_block'
  readonly name = 'stone_block'

  override get displayName(): string {
    return 'Stone Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/stone-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.STONE]
  }
}

