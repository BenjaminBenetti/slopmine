import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked snake meat item created by smelting raw snake in a forge.
 * A delicacy from the desert!
 */
export class CookedSnakeItem extends Item implements IConsumable {
  readonly id = 'cooked_snake'
  readonly name = 'cooked_snake'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Cooked Snake'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-snake-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(4)
  }
}
