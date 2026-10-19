import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Brown mushrooms simmered in a bowl.
 */
export class MushroomStewItem extends Item implements IConsumable {
  readonly id = 'mushroom_stew'
  readonly name = 'mushroom_stew'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(6)
  }

  override get displayName(): string {
    return 'Mushroom Stew'
  }

  override get iconUrl(): string {
    return new URL('./assets/mushroom-stew-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'cooked', 'stew']
  }
}
