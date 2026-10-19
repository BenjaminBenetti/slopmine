import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A whole pumpkin pie: one of the most filling foods there is.
 */
export class PumpkinPieItem extends Item implements IConsumable {
  readonly id = 'pumpkin_pie'
  readonly name = 'pumpkin_pie'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(9)
  }

  override get displayName(): string {
    return 'Pumpkin Pie'
  }

  override get iconUrl(): string {
    return new URL('./assets/pumpkin-pie-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'cooked', 'baked']
  }
}
