import { Item } from '../../Item.ts'

/**
 * Cooked pork item created by smelting raw pork in a forge.
 * Delicious and nutritious!
 */
export class CookedPorkItem extends Item {
  readonly id = 'cooked_pork'
  readonly name = 'cooked_pork'

  override get displayName(): string {
    return 'Cooked Pork'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-pork-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
