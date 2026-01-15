import { Item } from '../../Item.ts'

/**
 * Cooked fox meat item, produced by cooking raw fox meat in a forge.
 */
export class CookedFoxMeatItem extends Item {
  readonly id = 'cooked_fox_meat'
  readonly name = 'cooked_fox_meat'

  override get displayName(): string {
    return 'Cooked Fox Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-fox-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
