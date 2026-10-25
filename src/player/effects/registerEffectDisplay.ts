import { getStatusEffectInfo, registerStatusEffectInfo, StatusEffectIds } from './StatusEffects.ts'
import type { StatusEffectId } from './StatusEffects.ts'
import fireResistanceIcon from '../../items/potions/fire_resistance_potion/assets/fire-resistance-potion-icon.webp'
import slowFallingIcon from '../../items/potions/slow_falling_potion/assets/slow-falling-potion-icon.webp'
import regenerationIcon from '../../items/potions/regeneration_potion/assets/regeneration-potion-icon.webp'
import emberSightIcon from '../../items/potions/ember_sight_potion/assets/ember-sight-potion-icon.webp'
import strengthIcon from '../../items/potions/strength_potion/assets/strength-potion-icon.webp'
import iceskinIcon from '../../items/potions/iceskin_potion/assets/iceskin-potion-icon.webp'
import swiftnessIcon from '../../items/potions/swiftness_potion/assets/swiftness-potion-icon.webp'
import healingPotionIcon from '../../items/potions/health_potion_2/assets/health-potion-2-icon.webp'
import { POTION_SICKNESS_EFFECT } from '../../items/potions/HealingPotionCooldown.ts'
import poisonIcon from './assets/poison-effect-icon.webp'
import frostbiteIcon from './assets/frostbite-effect-icon.webp'

/**
 * Give every shared effect its HUD icon (buffs show their potion; the debuffs
 * have their own glyphs). Strength's badge colour follows its violet potion
 * (red reads as healing). Potion Sickness is the healing potions' shared
 * cooldown, shown as a debuff badge with its timer (no behaviour).
 */
export function registerEffectDisplay(): void {
  registerStatusEffectInfo(POTION_SICKNESS_EFFECT, {
    name: 'Potion Sickness',
    color: '#9a8a5a',
    beneficial: false,
    iconUrl: healingPotionIcon,
  })
  const icons: Array<[StatusEffectId, string, string?]> = [
    [StatusEffectIds.FIRE_RESISTANCE, fireResistanceIcon],
    [StatusEffectIds.SLOW_FALLING, slowFallingIcon],
    [StatusEffectIds.REGENERATION, regenerationIcon],
    [StatusEffectIds.EMBER_SIGHT, emberSightIcon],
    [StatusEffectIds.STRENGTH, strengthIcon, '#9c5ce0'],
    [StatusEffectIds.RESISTANCE, iceskinIcon],
    [StatusEffectIds.POISON, poisonIcon],
    [StatusEffectIds.SLOWNESS, frostbiteIcon],
    [StatusEffectIds.SWIFTNESS, swiftnessIcon],
  ]
  for (const [id, iconUrl, color] of icons) {
    const info = getStatusEffectInfo(id)
    registerStatusEffectInfo(id, { ...info, iconUrl, color: color ?? info.color })
  }
}
