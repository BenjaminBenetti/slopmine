import { registerDamageModifier, type DamageSource } from '../DamageModifiers.ts'
import type { PlayerEquipment } from './PlayerEquipment.ts'

/** Damage reduction per armor point (melee + projectile). */
export const ARMOR_REDUCTION_PER_POINT = 0.03
/** Highest total melee/projectile reduction armor can give. */
export const ARMOR_REDUCTION_CAP = 0.75

/**
 * Full-set bonuses (DESIGN §8):
 * - infernium: fire damage -50 %
 * - hellbane: fire damage -75 %, and the "Hellbane ward": melee + projectile
 *   damage taken a further -10 % after armor (still under the 75 % cap). The
 *   design's "+10 % melee" would need the weapons stream's attack pipeline, so
 *   it is a defensive bonus here.
 */
export interface ArmorSetBonus {
  readonly fireMultiplier: number
  readonly wardMultiplier: number
  readonly description: string
}

// Descriptions are short captions for the inventory's armor column (the
// hellbane ward is already part of its shown damage reduction)
const SET_BONUSES: Readonly<Record<string, ArmorSetBonus>> = {
  infernium: { fireMultiplier: 0.5, wardMultiplier: 1, description: 'Fire -50%' },
  hellbane: { fireMultiplier: 0.25, wardMultiplier: 0.9, description: 'Fire -75%' },
}

/** The bonus of a full set, or null when `setId` has none. */
export function getArmorSetBonus(setId: string | null): ArmorSetBonus | null {
  return setId ? (SET_BONUSES[setId] ?? null) : null
}

/** Fraction of melee/projectile damage absorbed by `points` armor points (0..cap). */
export function armorReductionFor(points: number, setBonus: ArmorSetBonus | null = null): number {
  const armor = Math.min(ARMOR_REDUCTION_CAP, Math.max(0, points) * ARMOR_REDUCTION_PER_POINT)
  const ward = setBonus?.wardMultiplier ?? 1
  return Math.min(ARMOR_REDUCTION_CAP, 1 - (1 - armor) * ward)
}

/** Fraction of melee/projectile damage the player's worn armor absorbs right now. */
export function getEquipmentReduction(equipment: PlayerEquipment): number {
  return armorReductionFor(equipment.armorPoints, getArmorSetBonus(equipment.fullSetId))
}

/**
 * Register armor's damage modifier: melee and projectile damage shrink by the
 * worn armor's reduction; fire damage by a full infernium/hellbane set's
 * bonus. Fall and magic damage are untouched. Returns an unregister function.
 */
export function registerArmorDamageModifier(equipment: PlayerEquipment): () => void {
  return registerDamageModifier((amount: number, source: DamageSource): number => {
    if (source === 'melee' || source === 'projectile') {
      return amount * (1 - getEquipmentReduction(equipment))
    }
    if (source === 'fire') {
      const bonus = getArmorSetBonus(equipment.fullSetId)
      return bonus ? amount * bonus.fireMultiplier : amount
    }
    return amount
  })
}
