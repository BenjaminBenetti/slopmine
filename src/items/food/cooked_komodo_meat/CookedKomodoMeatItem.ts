import { Item } from '../../Item.ts'

/**
 * Cooked komodo dragon meat item created by smelting raw komodo meat in a forge.
 * A volcanic delicacy!
 */
export class CookedKomodoMeatItem extends Item {
  readonly id = 'cooked_komodo_meat'
  readonly name = 'cooked_komodo_meat'

  override get displayName(): string {
    return 'Cooked Komodo Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-komodo-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
