import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Iceskin Potion - 20% less damage from mobs and projectiles for 2 minutes.
 * Brewed from herb + rime crystal (Cocytus).
 */
export class IceskinPotionItem extends EffectPotionItem {
  readonly id = 'iceskin_potion'
  readonly name = 'iceskin_potion'
  readonly effectId = StatusEffectIds.RESISTANCE
  readonly durationSeconds = 120

  override get displayName(): string {
    return 'Iceskin Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/iceskin-potion-icon.webp', import.meta.url).href
  }
}
