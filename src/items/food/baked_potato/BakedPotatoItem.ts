import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A forge-baked potato, fluffy and filling.
 */
export class BakedPotatoItem extends Item implements IConsumable {
  readonly id = 'baked_potato'
  readonly name = 'baked_potato'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(6)
  }

  override get displayName(): string {
    return 'Baked Potato'
  }

  override get iconUrl(): string {
    return new URL('./assets/baked-potato-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'cooked']
  }
}
