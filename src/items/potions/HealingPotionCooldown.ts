import { playerEffects } from '../../player/effects/StatusEffects.ts'
import { showPlayerNotice } from '../../ui/PlayerNotice.ts'

/**
 * Healing Potions I/II/III share one cooldown: after drinking any of them the
 * player can't drink another for HEALING_POTION_COOLDOWN seconds, so a stack
 * of potions is not an instant full heal mid-fight. Regeneration (a heal over
 * time) is not affected.
 *
 * The cooldown is a display-only status effect ("Potion Sickness", a debuff
 * badge with its timer on the effects HUD): no behaviour reads it except the
 * healing potions' start gate. Like every effect it is cleared on death and
 * not persisted.
 */
export const HEALING_POTION_COOLDOWN = 10

/** Status effect id of the cooldown (see registerEffectDisplay for its badge). */
export const POTION_SICKNESS_EFFECT = 'potion_sickness'

/** Seconds until another healing potion can be drunk (0 = ready). */
export function getHealingPotionCooldown(): number {
  return playerEffects.getRemaining(POTION_SICKNESS_EFFECT)
}

/**
 * `canConsume` gate of the healing potions: false (with a notice showing the
 * time left) while the cooldown runs.
 */
export function canDrinkHealingPotion(): boolean {
  const remaining = getHealingPotionCooldown()
  if (remaining <= 0) return true
  showPlayerNotice(`You can't stomach another healing potion yet (${Math.ceil(remaining)}s)`)
  return false
}

/** Start the shared cooldown (call from a healing potion's onConsume). */
export function startHealingPotionCooldown(): void {
  playerEffects.apply(POTION_SICKNESS_EFFECT, HEALING_POTION_COOLDOWN)
}
