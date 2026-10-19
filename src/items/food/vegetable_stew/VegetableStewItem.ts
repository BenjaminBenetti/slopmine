import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Carrot, potato and onion in a hearty bowl - the best meal a farm can make.
 */
export class VegetableStewItem extends Item implements IConsumable {
  readonly id = 'vegetable_stew'
  readonly name = 'vegetable_stew'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.2,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(12)
  }

  override get displayName(): string {
    return 'Vegetable Stew'
  }

  override get iconUrl(): string {
    return new URL('./assets/vegetable-stew-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'cooked', 'stew']
  }
}
