import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Fire Resistance Potion - lava, burning and hot floors deal no damage for 3 minutes.
 * Brewed from herb + magma cream (Molten Wastes).
 */
export class FireResistancePotionItem extends EffectPotionItem {
  readonly id = 'fire_resistance_potion'
  readonly name = 'fire_resistance_potion'
  readonly effectId = StatusEffectIds.FIRE_RESISTANCE
  readonly durationSeconds = 180

  override get displayName(): string {
    return 'Fire Resistance Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/fire-resistance-potion-icon.webp', import.meta.url).href
  }
}
