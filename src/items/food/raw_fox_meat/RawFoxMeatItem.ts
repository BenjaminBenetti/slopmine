import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw fox meat item dropped when killing foxes.
 * Can be eaten or cooked in a forge.
 */
export class RawFoxMeatItem extends Item implements IConsumable {
  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }
  readonly id = 'raw_fox_meat'
  readonly name = 'raw_fox_meat'

  override get displayName(): string {
    return 'Raw Fox Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-fox-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
