import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Long Ember Sight Potion - ember sight for 8 minutes.
 * Brewed from herb + glowcap + corrupted essence.
 */
export class LongEmberSightPotionItem extends EffectPotionItem {
  readonly id = 'ember_sight_potion_long'
  readonly name = 'ember_sight_potion_long'
  readonly effectId = StatusEffectIds.EMBER_SIGHT
  readonly durationSeconds = 480

  override get displayName(): string {
    return 'Long Ember Sight Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/ember-sight-potion-long-icon.webp', import.meta.url).href
  }
}
