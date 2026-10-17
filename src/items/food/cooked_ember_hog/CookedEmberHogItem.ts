import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'

/** Cooked ember hog - the hearty meal that makes the Hell layer livable. */
export class CookedEmberHogItem extends Item implements IConsumable {
  readonly id = 'cooked_ember_hog'
  readonly name = 'cooked_ember_hog'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 2.0,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(9)
  }

  override get displayName(): string {
    return 'Cooked Ember Hog'
  }

  override get iconUrl(): string {
    return new URL('./assets/cooked-ember-hog-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'meat', 'cooked']
  }
}
