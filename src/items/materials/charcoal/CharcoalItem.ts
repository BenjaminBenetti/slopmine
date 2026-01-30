import { Item } from '../../Item.ts'
import { ItemTags } from '../../tags/index.ts'

/**
 * Charcoal item obtained by smelting wood logs.
 * Alternative to coal for crafting torches and as furnace fuel.
 */
export class CharcoalItem extends Item {
  readonly id = 'charcoal'
  readonly name = 'charcoal'

  override get displayName(): string {
    return 'Charcoal'
  }

  override get iconUrl(): string {
    return new URL('./assets/charcoal-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return [ItemTags.COAL, ItemTags.FUEL]
  }
}
