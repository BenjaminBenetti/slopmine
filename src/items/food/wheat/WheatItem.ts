import { Item } from '../../Item.ts'

/**
 * Wheat item harvested from mature wheat plants.
 * Can be used for crafting bread or other food items.
 */
export class WheatItem extends Item {
  readonly id = 'wheat'
  readonly name = 'wheat'

  override get displayName(): string {
    return 'Wheat'
  }

  override get iconUrl(): string {
    return new URL('./assets/wheat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'grain', 'ingredient']
  }
}
