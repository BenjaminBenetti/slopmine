import { Item } from '../../Item.ts'

/**
 * Cooked snake meat item created by smelting raw snake in a forge.
 * A delicacy from the desert!
 */
export class CookedSnakeItem extends Item {
  readonly id = 'cooked_snake'
  readonly name = 'cooked_snake'

  override get displayName(): string {
    return 'Cooked Snake'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-snake-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
