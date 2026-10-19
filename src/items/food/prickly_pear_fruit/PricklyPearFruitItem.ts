import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * The juicy fruit of a desert prickly pear: food where little else grows.
 */
export class PricklyPearFruitItem extends Item implements IConsumable {
  readonly id = 'prickly_pear_fruit'
  readonly name = 'prickly_pear_fruit'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(3)
  }

  override get displayName(): string {
    return 'Prickly Pear'
  }

  override get iconUrl(): string {
    return new URL('./assets/prickly-pear-fruit-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw']
  }
}
