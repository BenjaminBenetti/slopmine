import { EffectPotionItem } from '../EffectPotionItem.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'

/**
 * Regeneration Potion - Regeneration II: heals 1 HP every 1.25 s for 45
 * seconds (36 HP). Brewed from herb + ectoplasm (The Ossuary). Not affected
 * by the healing potions' cooldown.
 */
export class RegenerationPotionItem extends EffectPotionItem {
  readonly id = 'regeneration_potion'
  readonly name = 'regeneration_potion'
  readonly effectId = StatusEffectIds.REGENERATION
  readonly durationSeconds = 45
  override readonly effectLevel = 2

  override get displayName(): string {
    return 'Regeneration Potion'
  }

  override get iconUrl(): string {
    return new URL('./assets/regeneration-potion-icon.webp', import.meta.url).href
  }
}
