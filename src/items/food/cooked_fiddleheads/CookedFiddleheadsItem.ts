import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Cooked fiddleheads - pan-fired fern shoots, a forager's staple of the
 * coastal rain forest. Made by cooking fiddleheads in a forge.
 */
export class CookedFiddleheadsItem extends Item implements IConsumable {
  readonly id = 'cooked_fiddleheads'
  readonly name = 'cooked_fiddleheads'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(3)
  }

  override get displayName(): string {
    return 'Cooked Fiddleheads'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-fiddleheads-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'cooked']
  }
}
