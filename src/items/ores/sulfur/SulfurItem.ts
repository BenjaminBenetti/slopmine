import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Sulfur item dropped when mining sulfur ore blocks.
 * A premium smelting fuel (burns hotter than coal).
 */
export class SulfurItem extends Item {
  readonly id = 'sulfur'
  readonly name = 'sulfur'

  override get displayName(): string {
    return 'Sulfur'
  }

  override get iconUrl(): string {
    return new URL('./assets/sulfur-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE, ItemTags.FUEL]
  }
}
