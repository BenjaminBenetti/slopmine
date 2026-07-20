import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/**
 * Wild berries foraged from berry bushes in the pine forest.
 * A quick trail snack - eaten fast, restores a little health.
 */
export class BerriesItem extends Item implements IConsumable {
  readonly id = 'berries'
  readonly name = 'berries'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.0, // A handful of berries goes down quickly
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Berries'
  }

  override get iconUrl(): string {
    return new URL('./assets/berries-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw']
  }
}
