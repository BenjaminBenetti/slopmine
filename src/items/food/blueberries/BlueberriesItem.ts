import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Wild blueberries picked from a bush in the pine forest.
 */
export class BlueberriesItem extends Item implements IConsumable {
  readonly id = 'blueberries'
  readonly name = 'blueberries'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 0.8,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Blueberries'
  }

  override get iconUrl(): string {
    return new URL('./assets/blueberries-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw']
  }
}
