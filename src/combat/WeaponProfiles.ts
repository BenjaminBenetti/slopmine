import type { IItem } from '../items/Item.ts'
import type { IWeaponStats } from '../items/interfaces/IWeaponStats.ts'
import { hasWeaponStats } from '../items/interfaces/IWeaponStats.ts'
import { hasToolStats } from '../items/interfaces/IToolStats.ts'

/**
 * Melee profiles: how hard, how fast and how far every held item hits.
 *
 * One table drives everything: swords hit for their material's damage, axes
 * a little harder but much slower (the heavy hitter), pickaxes and shovels
 * less. A tool never hits weaker than the bare fist. Swords carry their profile as
 * `weaponStats` (built with weaponProfileFor); tools get theirs derived from
 * their item id (`<material>_<kind>`), so mining stats never leak into combat.
 */

/** Weapon/tool materials in progression order. */
export type WeaponMaterial = 'wood' | 'stone' | 'iron' | 'steel' | 'diamond' | 'infernium' | 'hellbane'

/** Item shapes with their own attack rules. */
export type WeaponKind = 'sword' | 'axe' | 'pickaxe' | 'shovel' | 'hoe'

/** Damage of a fully charged sword hit, per material. */
export const SWORD_DAMAGE: Readonly<Record<WeaponMaterial, number>> = {
  wood: 4,
  stone: 5,
  iron: 6,
  steel: 7,
  diamond: 8,
  infernium: 10,
  hellbane: 13,
}

/** Bare hand (and any item that isn't a weapon or tool: blocks, food, ...). */
export const FIST_PROFILE: IWeaponStats = {
  attackDamage: 2,
  attackCooldown: 0.4,
  knockback: 0.8,
}

interface KindRule {
  /** Damage relative to the sword of the same material */
  readonly damageOffset: number
  readonly attackCooldown: number
  readonly knockback: number
}

const KIND_RULES: Readonly<Record<WeaponKind, KindRule>> = {
  sword: { damageOffset: 0, attackCooldown: 0.5, knockback: 1.0 },
  // Heavy and slow: the hardest hit and knock, the longest recovery
  axe: { damageOffset: 1, attackCooldown: 0.8, knockback: 1.3 },
  pickaxe: { damageOffset: -2, attackCooldown: 0.65, knockback: 0.9 },
  shovel: { damageOffset: -3, attackCooldown: 0.6, knockback: 1.0 },
  // A farm tool: light, quick, barely a weapon
  hoe: { damageOffset: -3, attackCooldown: 0.55, knockback: 0.8 },
}

const MATERIALS: readonly WeaponMaterial[] = ['wood', 'stone', 'iron', 'steel', 'diamond', 'infernium', 'hellbane']

/** Material for a demolition force tier (wood 1 ... hellbane 7), for tools with unknown ids. */
function materialForForce(force: number): WeaponMaterial {
  const index = Math.min(MATERIALS.length - 1, Math.max(0, Math.round(force) - 1))
  return MATERIALS[index]
}

/**
 * The profile of a `kind` made of `material`.
 */
export function weaponProfileFor(kind: WeaponKind, material: WeaponMaterial): IWeaponStats {
  const rule = KIND_RULES[kind]
  return {
    attackDamage: Math.max(FIST_PROFILE.attackDamage, SWORD_DAMAGE[material] + rule.damageOffset),
    attackCooldown: rule.attackCooldown,
    knockback: rule.knockback,
  }
}

const profileCache = new Map<string, IWeaponStats>()

function deriveToolProfile(item: IItem, demolitionForce: number): IWeaponStats {
  const separator = item.id.lastIndexOf('_')
  const prefix = separator > 0 ? item.id.slice(0, separator) : ''
  const suffix = separator > 0 ? item.id.slice(separator + 1) : item.id
  const kind: WeaponKind = suffix in KIND_RULES ? (suffix as WeaponKind) : 'shovel'
  const material: WeaponMaterial = (MATERIALS as readonly string[]).includes(prefix)
    ? (prefix as WeaponMaterial)
    : materialForForce(demolitionForce)
  return weaponProfileFor(kind, material)
}

/**
 * The melee profile of whatever the player holds (null = empty hand).
 */
export function getWeaponProfile(item: IItem | null | undefined): IWeaponStats {
  if (!item) return FIST_PROFILE
  if (hasWeaponStats(item)) return item.weaponStats
  if (!hasToolStats(item)) return FIST_PROFILE

  let profile = profileCache.get(item.id)
  if (!profile) {
    profile = deriveToolProfile(item, item.toolStats.demolitionForce)
    profileCache.set(item.id, profile)
  }
  return profile
}
