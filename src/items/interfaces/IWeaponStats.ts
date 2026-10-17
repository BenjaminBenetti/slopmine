/**
 * Melee stats of an item built to fight with (swords).
 *
 * Mining tools don't carry these: their attack values are derived from tool
 * type and material in src/combat/WeaponProfiles.ts, so mining stats and
 * combat stats stay independent.
 */
export interface IWeaponStats {
  /** Damage of a fully charged hit */
  readonly attackDamage: number
  /** Seconds after a hit until the next hit is fully charged */
  readonly attackCooldown: number
  /** Multiplier on the target's knockback (1 = the entity's own default) */
  readonly knockback: number
}

/**
 * Type guard: does this item carry weapon stats?
 */
export function hasWeaponStats(item: unknown): item is { weaponStats: IWeaponStats } {
  return (
    item !== null &&
    typeof item === 'object' &&
    'weaponStats' in item &&
    typeof (item as { weaponStats: unknown }).weaponStats === 'object'
  )
}
