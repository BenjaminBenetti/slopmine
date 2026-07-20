import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * A forge-roasted morel mushroom. Morels must be cooked before eating -
 * the raw mushroom is a plantable block item (MorelMushroomBlockItem), not food.
 */
export class CookedMorelItem extends Item implements IConsumable {
  readonly id = 'cooked_morel'
  readonly name = 'cooked_morel'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(4)
  }

  override get displayName(): string {
    return 'Cooked Morel'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-morel-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'cooked', 'mushroom']
  }
}
