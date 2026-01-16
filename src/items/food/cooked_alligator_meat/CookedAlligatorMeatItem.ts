import { Item } from '../../Item.ts'

/**
 * Cooked alligator meat item.
 * Made by cooking raw alligator meat in a forge.
 */
export class CookedAlligatorMeatItem extends Item {
  readonly id = 'cooked_alligator_meat'
  readonly name = 'cooked_alligator_meat'

  override get displayName(): string {
    return 'Cooked Alligator Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-alligator-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
