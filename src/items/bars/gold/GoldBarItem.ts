import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Gold bar item produced by smelting gold ore in a forge.
 * Used for crafting gold tools and equipment.
 */
export class GoldBarItem extends Item {
  readonly id = 'gold_bar'
  readonly name = 'gold_bar'

  override get displayName(): string {
    return 'Gold Bar'
  }

  override get iconUrl(): string {
    return new URL('./assets/gold-bar-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL, ItemTags.BAR]
  }
}
