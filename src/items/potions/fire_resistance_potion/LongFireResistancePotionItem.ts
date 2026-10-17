import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Long Fire Resistance Potion - fire resistance for 8 minutes.
 * Brewed from herb + magma cream + corrupted essence.
 */
export class LongFireResistancePotionItem extends EffectPotionItem {
  readonly id = 'fire_resistance_potion_long'
  readonly name = 'fire_resistance_potion_long'
  readonly effectId = StatusEffectIds.FIRE_RESISTANCE
  readonly durationSeconds = 480

  override get displayName(): string {
    return 'Long Fire Resistance Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/fire-resistance-potion-long-icon.webp', import.meta.url).href
  }
}
