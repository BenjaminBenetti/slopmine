import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Strength Potion - more melee damage for 2 minutes (the attack formula reads the effect).
 * Brewed from herb + prism shard (Crystal Abyss).
 */
export class StrengthPotionItem extends EffectPotionItem {
  readonly id = 'strength_potion'
  readonly name = 'strength_potion'
  readonly effectId = StatusEffectIds.STRENGTH
  readonly durationSeconds = 120

  override get displayName(): string {
    return 'Strength Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/strength-potion-icon.webp', import.meta.url).href
  }
}
