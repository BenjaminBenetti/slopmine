import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Fiddleheads - young curled fern shoots foraged from coastal ferns.
 * Edible raw in a pinch, but they really should be cooked first.
 */
export class FiddleheadsItem extends Item implements IConsumable {
  readonly id = 'fiddleheads'
  readonly name = 'fiddleheads'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
  }

  override get displayName(): string {
    return 'Fiddleheads'
  }

  override get iconUrl(): string {
    return new URL('./assets/fiddleheads-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw']
  }
}
