import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Ember Sight Potion - the dark of Hell lifts to a warm, readable glow for 4 minutes.
 * Brewed from herb + glowcap (Ember Grove).
 */
export class EmberSightPotionItem extends EffectPotionItem {
  readonly id = 'ember_sight_potion'
  readonly name = 'ember_sight_potion'
  readonly effectId = StatusEffectIds.EMBER_SIGHT
  readonly durationSeconds = 240

  override get displayName(): string {
    return 'Ember Sight Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/ember-sight-potion-icon.webp', import.meta.url).href
  }
}
