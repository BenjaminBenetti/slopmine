import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw beef item dropped when killing cows.
 * Can be eaten or cooked in a forge.
 */
export class RawBeefItem extends Item implements IConsumable {
  readonly id = 'raw_beef'
  readonly name = 'raw_beef'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Raw Beef'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-beef-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(3)
  }
}
