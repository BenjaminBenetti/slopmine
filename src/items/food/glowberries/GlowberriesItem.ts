import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlantable } from '../../interfaces/IPlantable.ts'

/**
 * Glowberries picked from cave vines in the mossy grottos: a sweet snack,
 * and planted under any ceiling they grow a new cave vine.
 */
export class GlowberriesItem extends Item implements IConsumable, IPlantable {
  readonly id = 'glowberries'
  readonly name = 'glowberries'
  readonly plantsBlock = 'cave_vines'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 0.9,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(3)
  }

  override get displayName(): string {
    return 'Glowberries'
  }

  override get iconUrl(): string {
    return new URL('./assets/glowberries-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw']
  }
}
