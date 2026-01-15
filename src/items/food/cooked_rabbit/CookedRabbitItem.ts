import { Item } from '../../Item.ts'

/**
 * Cooked rabbit item created by smelting raw rabbit in a forge.
 * Delicious and nutritious!
 */
export class CookedRabbitItem extends Item {
  readonly id = 'cooked_rabbit'
  readonly name = 'cooked_rabbit'

  override get displayName(): string {
    return 'Cooked Rabbit'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-rabbit-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
