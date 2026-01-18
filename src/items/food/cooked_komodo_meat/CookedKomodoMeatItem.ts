import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked komodo dragon meat item created by smelting raw komodo meat in a forge.
 * A volcanic delicacy!
 */
export class CookedKomodoMeatItem extends Item implements IConsumable {
  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(7)
  }
  readonly id = 'cooked_komodo_meat'
  readonly name = 'cooked_komodo_meat'

  override get displayName(): string {
    return 'Cooked Komodo Meat'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-komodo-meat-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
