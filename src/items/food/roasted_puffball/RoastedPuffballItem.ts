import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A cave puffball roasted in a forge until its skin toasts golden - soft and nutty inside.
 */
export class RoastedPuffballItem extends Item implements IConsumable {
  readonly id = 'roasted_puffball'
  readonly name = 'roasted_puffball'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(4)
  }

  override get displayName(): string {
    return "Roasted Puffball"
  }

  override get iconUrl(): string {
    return new URL('./assets/roasted-puffball-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'cooked', 'mushroom']
  }
}
