import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A sweet red strawberry.
 */
export class StrawberryItem extends Item implements IConsumable {
  readonly id = 'strawberry'
  readonly name = 'strawberry'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 0.8,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Strawberry'
  }

  override get iconUrl(): string {
    return new URL('./assets/strawberry-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw', 'crop']
  }
}
