import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw crab meat item dropped when killing crabs.
 * Can be eaten or cooked in a forge.
 */
export class RawCrabMeatItem extends Item implements IConsumable {
  readonly id = 'raw_crab_meat'
  readonly name = 'raw_crab_meat'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
  }

  override get displayName(): string {
    return 'Raw Crab Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-crab-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
