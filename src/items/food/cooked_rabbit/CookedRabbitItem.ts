import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked rabbit item created by smelting raw rabbit in a forge.
 * Delicious and nutritious!
 */
export class CookedRabbitItem extends Item implements IConsumable {
  readonly id = 'cooked_rabbit'
  readonly name = 'cooked_rabbit'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Cooked Rabbit'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-rabbit-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(5)
  }
}
