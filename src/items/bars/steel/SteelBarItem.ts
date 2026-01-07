import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Steel bar item produced by smelting iron bars in a forge.
 * Used for crafting steel tools and equipment.
 * Takes 30 seconds to smelt due to the high temperatures required.
 */
export class SteelBarItem extends Item {
  readonly id = 'steel_bar'
  readonly name = 'steel_bar'

  override get displayName(): string {
    return 'Steel Bar'
  }

  override get iconUrl(): string {
    return new URL('./assets/steel-bar-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL, ItemTags.BAR]
  }
}
