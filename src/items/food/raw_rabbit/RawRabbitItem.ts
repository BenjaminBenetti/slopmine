import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw rabbit item dropped when killing rabbits.
 * Can be eaten or cooked in a forge.
 */
export class RawRabbitItem extends Item implements IConsumable {
  readonly id = 'raw_rabbit'
  readonly name = 'raw_rabbit'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
  }

  override get displayName(): string {
    return 'Raw Rabbit'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-rabbit-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
