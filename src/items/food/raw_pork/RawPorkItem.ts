import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw pork item dropped when killing pigs.
 * Can be eaten or cooked in a forge.
 */
export class RawPorkItem extends Item implements IConsumable {
  readonly id = 'raw_pork'
  readonly name = 'raw_pork'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Raw Pork'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-pork-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
