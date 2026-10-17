import { Item } from '../../Item.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import { playerEffects, StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Glowcap - a small bioluminescent mushroom picked from the Ember Grove
 * floor. Barely a snack raw, but its glow lingers in the eyes (a short
 * taste of ember sight); roast it in a forge for a proper meal. Also the
 * ember-sight potion ingredient and a hellbane leggings/shovel material.
 */
export class GlowcapItem extends Item implements IConsumable {
  readonly id = 'glowcap'
  readonly name = 'glowcap'

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.2,
  }

  onConsume(playerHealth: IPlayerHealth): void {
    playerHealth.heal(1)
    playerEffects.apply(StatusEffectIds.EMBER_SIGHT, 20, 1)
  }

  override get displayName(): string {
    return 'Glowcap'
  }

  override get iconUrl(): string {
    return new URL('./assets/glowcap-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food', 'plant', 'raw', 'mushroom']
  }
}
