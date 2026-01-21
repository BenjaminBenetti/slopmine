import { Item } from '../../Item.ts'

/**
 * Herb item harvested from mature herb plants.
 * Can be used for brewing or crafting.
 */
export class HerbItem extends Item {
  readonly id = 'herb'
  readonly name = 'herb'

  override get displayName(): string {
    return 'Herb'
  }

  override get iconUrl(): string {
    return new URL('./assets/herb-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['herb', 'ingredient', 'brewing']
  }
}
