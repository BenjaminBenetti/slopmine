import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * A raw potato - better baked in the forge. Plant it on farmland to grow more.
 */
export class PotatoItem extends Item implements IConsumable, IPlantable {
  readonly id = 'potato'
  readonly name = 'potato'
  readonly plantsBlock = 'potato_1'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.2,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
  }

  override get displayName(): string {
    return 'Potato'
  }

  override get iconUrl(): string {
    return new URL('./assets/potato-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw', 'crop']
  }
}
