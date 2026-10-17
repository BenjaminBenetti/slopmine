import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/** Raw ember hog - meat from the Ember Grove's grazing hogs. Cook it. */
export class RawEmberHogItem extends Item implements IConsumable {
  readonly id = 'raw_ember_hog'
  readonly name = 'raw_ember_hog'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(2)
  }

  override get displayName(): string {
    return 'Raw Ember Hog'
  }

  override get iconUrl(): string {
    return new URL('./assets/raw-ember-hog-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'raw']
  }
}
