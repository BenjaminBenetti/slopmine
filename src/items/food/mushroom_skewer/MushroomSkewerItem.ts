import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A stick threaded with a roasted puffball, a roasted toadstool and brown mushrooms: the forager's best meal.
 */
export class MushroomSkewerItem extends Item implements IConsumable {
  readonly id = 'mushroom_skewer'
  readonly name = 'mushroom_skewer'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(10)
  }

  override get displayName(): string {
    return "Mushroom Skewer"
  }

  override get iconUrl(): string {
    return new URL('./assets/mushroom-skewer-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'cooked', 'mushroom']
  }
}
