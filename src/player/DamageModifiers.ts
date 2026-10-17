/**
 * Player damage modifier pipeline.
 *
 * Every damage path to the player runs its amount through
 * `applyDamageModifiers(amount, source)` before touching PlayerHealth, and
 * systems that change incoming damage (armor, fire resistance, resistance
 * potions, slow falling, armor set bonuses...) register a modifier instead of
 * editing those paths. Modifiers run in registration order; the result is
 * clamped at 0.
 */

/**
 * - melee: mob contact/melee attacks (PlayerDamageHandler default)
 * - projectile: arrows, fireballs, shards
 * - fire: lava, burning, hot floors (EnvironmentalDamage)
 * - fall: fall damage
 * - magic: effect damage over time (poison) - armor does not apply
 */
export type DamageSource = 'melee' | 'projectile' | 'fire' | 'fall' | 'magic'

export type DamageModifier = (amount: number, source: DamageSource) => number

const modifiers: DamageModifier[] = []

/** Register a modifier. Returns an unregister function. */
export function registerDamageModifier(modifier: DamageModifier): () => void {
  modifiers.push(modifier)
  return () => {
    const index = modifiers.indexOf(modifier)
    if (index >= 0) modifiers.splice(index, 1)
  }
}

/** Run `amount` through every registered modifier (never below 0). */
export function applyDamageModifiers(amount: number, source: DamageSource): number {
  let result = amount
  for (const modifier of modifiers) {
    result = modifier(result, source)
  }
  return Math.max(0, result)
}
