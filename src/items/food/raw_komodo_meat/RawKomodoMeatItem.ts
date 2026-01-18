import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Raw komodo dragon meat item dropped when killing komodo dragons.
 * Can be eaten or cooked in a forge.
 */
export class RawKomodoMeatItem extends Item implements IConsumable {
  readonly id = 'raw_komodo_meat'
  readonly name = 'raw_komodo_meat'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Raw Komodo Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-komodo-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
