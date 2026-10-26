import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Water Breathing Potion - the player's air never runs out under water for
 * 3 minutes (the breath system reads the effect). Brewed from herb + glow
 * jelly (jellyfish, out at sea).
 */
export class WaterBreathingPotionItem extends EffectPotionItem {
  readonly id = 'water_breathing_potion'
  readonly name = 'water_breathing_potion'
  readonly effectId = StatusEffectIds.WATER_BREATHING
  readonly durationSeconds = 180

  override get displayName(): string {
    return 'Water Breathing Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/water-breathing-potion-icon.webp', import.meta.url).href
  }
}
