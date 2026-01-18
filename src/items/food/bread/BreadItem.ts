import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

export class BreadItem extends Item implements IConsumable {
  readonly id = 'bread'
  readonly name = 'bread'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  override get displayName(): string {
    return 'Bread'
  }

  override get iconUrl(): string {
    return new URL('./assets/bread-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food']
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(6)
  }
}
