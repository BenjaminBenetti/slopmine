import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * A sharp golden onion - best in a stew. Plant it on farmland to grow more.
 */
export class OnionItem extends Item implements IConsumable, IPlantable {
  readonly id = 'onion'
  readonly name = 'onion'
  readonly plantsBlock = 'onion_1'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.2,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
  }

  override get displayName(): string {
    return 'Onion'
  }

  override get iconUrl(): string {
    return new URL('./assets/onion-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw', 'crop']
  }
}
