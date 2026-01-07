import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Iron bar item produced by smelting iron ore in a forge.
 * Used for crafting iron tools and equipment.
 */
export class IronBarItem extends Item {
  readonly id = 'iron_bar'
  readonly name = 'iron_bar'

  override get displayName(): string {
    return 'Iron Bar'
  }

  override get iconUrl(): string {
    return new URL('./assets/iron-bar-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL, ItemTags.BAR]
  }
}
