import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A ripe tomato from the vine. Its seeds grow more.
 */
export class TomatoItem extends Item implements IConsumable {
  readonly id = 'tomato'
  readonly name = 'tomato'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Tomato'
  }

  override get iconUrl(): string {
    return new URL('./assets/tomato-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw', 'crop']
  }
}
