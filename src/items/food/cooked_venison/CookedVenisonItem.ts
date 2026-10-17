import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked venison: deer meat (`venison`) roasted in a forge.
 * Lean and filling.
 */
export class CookedVenisonItem extends Item implements IConsumable {
  readonly id = 'cooked_venison'
  readonly name = 'cooked_venison'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Cooked Venison'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-venison-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(9)
  }
}
