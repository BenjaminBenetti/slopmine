import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Swiftness Potion - walk faster for 2 minutes (the movement speed multiplier
 * reads the effect). Brewed from herb + a whirlstone (Dune Dervish, desert
 * sandstorms).
 */
export class SwiftnessPotionItem extends EffectPotionItem {
  readonly id = 'swiftness_potion'
  readonly name = 'swiftness_potion'
  readonly effectId = StatusEffectIds.SWIFTNESS
  readonly durationSeconds = 120

  override get displayName(): string {
    return 'Swiftness Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/swiftness-potion-icon.webp', import.meta.url).href
  }
}
