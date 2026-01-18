import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked alligator meat item.
 * Made by cooking raw alligator meat in a forge.
 */
export class CookedAlligatorMeatItem extends Item implements IConsumable {
  readonly id = 'cooked_alligator_meat'
  readonly name = 'cooked_alligator_meat'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Cooked Alligator Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-alligator-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(8)
  }
}
