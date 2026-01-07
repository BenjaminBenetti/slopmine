import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Coal ore item dropped when mining coal blocks.
 * Used as fuel for smelting.
 */
export class CoalItem extends Item {
  readonly id = 'coal'
  readonly name = 'coal'

  override get displayName(): string {
    return 'Coal'
  }

  override get iconUrl(): string {
    return new URL('./assets/coal-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.ORE, ItemTags.FUEL]
  }
}
