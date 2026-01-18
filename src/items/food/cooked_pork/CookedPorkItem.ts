import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked pork item created by smelting raw pork in a forge.
 * Delicious and nutritious!
 */
export class CookedPorkItem extends Item implements IConsumable {
  readonly id = 'cooked_pork'
  readonly name = 'cooked_pork'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Cooked Pork'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-pork-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(8)
  }
}
