import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A bowl of edible leaves and flowers picked from the wild (clover, dandelion, daisy...).
 */
export class ForagerSaladItem extends Item implements IConsumable {
  readonly id = 'forager_salad'
  readonly name = 'forager_salad'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(7)
  }

  override get displayName(): string {
    return "Forager's Salad"
  }

  override get iconUrl(): string {
    return new URL('./assets/forager-salad-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant']
  }
}
