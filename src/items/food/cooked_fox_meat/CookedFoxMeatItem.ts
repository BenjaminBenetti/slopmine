import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked fox meat item, produced by cooking raw fox meat in a forge.
 */
export class CookedFoxMeatItem extends Item implements IConsumable {
  readonly id = 'cooked_fox_meat'
  readonly name = 'cooked_fox_meat'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(6)
  }

  override get displayName(): string {
    return 'Cooked Fox Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-fox-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
