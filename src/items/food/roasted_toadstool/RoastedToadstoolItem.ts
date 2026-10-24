import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A toadstool roasted in a forge - the heat drives off what makes it unwise to eat raw.
 */
export class RoastedToadstoolItem extends Item implements IConsumable {
  readonly id = 'roasted_toadstool'
  readonly name = 'roasted_toadstool'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(3)
  }

  override get displayName(): string {
    return "Roasted Toadstool"
  }

  override get iconUrl(): string {
    return new URL('./assets/roasted-toadstool-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'cooked', 'mushroom']
  }
}
