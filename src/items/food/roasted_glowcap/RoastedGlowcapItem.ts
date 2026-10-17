import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/** A forge-roasted glowcap: the glow is gone, the meal is real. */
export class RoastedGlowcapItem extends Item implements IConsumable {
  readonly id = 'roasted_glowcap'
  readonly name = 'roasted_glowcap'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(5)
  }

  override get displayName(): string {
    return 'Roasted Glowcap'
  }

  override get iconUrl(): string {
    return new URL('./assets/roasted-glowcap-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'cooked', 'mushroom']
  }
}
