import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Copper bar item produced by smelting copper ore in a forge.
 * Used for crafting copper tools and equipment.
 */
export class CopperBarItem extends Item {
  readonly id = 'copper_bar'
  readonly name = 'copper_bar'

  override get displayName(): string {
    return 'Copper Bar'
  }

  override get iconUrl(): string {
    return new URL('./assets/copper-bar-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.METAL, ItemTags.BAR]
  }
}
