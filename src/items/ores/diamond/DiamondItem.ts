import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Diamond item dropped when mining diamond blocks.
 * Used for crafting high-tier tools and equipment.
 */
export class DiamondItem extends Item {
  readonly id = 'diamond'
  readonly name = 'diamond'

  override get displayName(): string {
    return 'Diamond'
  }

  override get iconUrl(): string {
    return new URL('./assets/diamond-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE]
  }
}
