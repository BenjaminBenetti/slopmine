import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * A fleshy aloe leaf from the desert. Soothing: eating it also cures poison.
 */
export class AloeLeafItem extends Item implements IConsumable {
  readonly id = 'aloe_leaf'
  readonly name = 'aloe_leaf'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.2,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(3)
    playerEffects.remove(StatusEffectIds.POISON)
  }

  override get displayName(): string {
    return 'Aloe Leaf'
  }

  override get iconUrl(): string {
    return new URL('./assets/aloe-leaf-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'medicinal']
  }
}
