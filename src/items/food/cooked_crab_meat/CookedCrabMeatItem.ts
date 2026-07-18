import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked crab meat item created by cooking raw crab meat in a forge.
 * A delicate coastal treat.
 */
export class CookedCrabMeatItem extends Item implements IConsumable {
  readonly id = 'cooked_crab_meat'
  readonly name = 'cooked_crab_meat'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(4)
  }

  override get displayName(): string {
    return 'Cooked Crab Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-crab-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
