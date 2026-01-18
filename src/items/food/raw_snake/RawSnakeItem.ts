import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw snake meat item dropped when killing snakes.
 * Can be eaten or cooked in a forge.
 */
export class RawSnakeItem extends Item implements IConsumable {
  readonly id = 'raw_snake'
  readonly name = 'raw_snake'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
  }

  override get displayName(): string {
    return 'Raw Snake'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-snake-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
