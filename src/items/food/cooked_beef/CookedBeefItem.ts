import { Item } from '../../Item.ts'

/**
 * Cooked beef item created by smelting raw beef in a forge.
 * Delicious and nutritious!
 */
export class CookedBeefItem extends Item {
  readonly id = 'cooked_beef'
  readonly name = 'cooked_beef'

  override get displayName(): string {
    return 'Cooked Beef'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-beef-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
