import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Slow Falling Potion - glide down gently with no fall damage for 90 seconds.
 * Brewed from herb + ember roach wing, or on the surface from herb + cattail fluff,
 * so the first descent into Hell can be survived.
 */
export class SlowFallingPotionItem extends EffectPotionItem {
  readonly id = 'slow_falling_potion'
  readonly name = 'slow_falling_potion'
  readonly effectId = StatusEffectIds.SLOW_FALLING
  readonly durationSeconds = 90

  override get displayName(): string {
    return 'Slow Falling Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/slow-falling-potion-icon.webp', import.meta.url).href
  }
}
