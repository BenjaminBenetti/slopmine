import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A sweet jungle pineapple.
 */
export class PineappleItem extends Item implements IConsumable {
  readonly id = 'pineapple'
  readonly name = 'pineapple'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.4,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(4)
  }

  override get displayName(): string {
    return 'Pineapple'
  }

  override get iconUrl(): string {
    return new URL('./assets/pineapple-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw']
  }
}
