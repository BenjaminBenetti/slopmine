import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw venison dropped when killing deer.
 * A modest raw meat - can be eaten as-is or cooked in a forge.
 */
export class VenisonItem extends Item implements IConsumable {
  readonly id = 'venison'
  readonly name = 'venison'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Venison'
  }

  override get iconUrl(): string {
    return new URL('./assets/venison-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
