import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked beef item created by smelting raw beef in a forge.
 * Delicious and nutritious!
 */
export class CookedBeefItem extends Item implements IConsumable {
  readonly id = 'cooked_beef'
  readonly name = 'cooked_beef'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Cooked Beef'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-beef-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(10)
  }
}
