import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw alligator meat item dropped when killing alligators.
 * Can be cooked in a forge.
 */
export class RawAlligatorMeatItem extends Item implements IConsumable {
  readonly id = 'raw_alligator_meat'
  readonly name = 'raw_alligator_meat'

  override get displayName(): string {
    return 'Raw Alligator Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-alligator-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }
}
