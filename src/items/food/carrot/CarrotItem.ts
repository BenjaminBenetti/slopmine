import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * A crunchy carrot. Eat it raw, or plant it on farmland to grow more.
 */
export class CarrotItem extends Item implements IConsumable, IPlantable {
  readonly id = 'carrot'
  readonly name = 'carrot'
  readonly plantsBlock = 'carrot_1'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Carrot'
  }

  override get iconUrl(): string {
    return new URL('./assets/carrot-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw', 'crop']
  }
}
