import { Item, type IItem } from '../Item.ts'
import type { ArmorSlot } from './ArmorTiers.ts'

/**
 * Base class for wearable armor. Armor never stacks; it is worn in one of
 * the four equipment slots (see PlayerEquipment) and adds its armor points
 * to the player's damage reduction.
 */
export abstract class ArmorItem extends Item {
  /** Equipment slot this piece is worn in */
  abstract readonly armorSlot: ArmorSlot
  /** Armor points this piece adds while worn */
  abstract readonly armorPoints: number
  /** Progression tier (leather 1 ... hellbane 7) */
  abstract readonly armorTier: number
  /** Set id for full-set bonuses (all four slots from one set) */
  abstract readonly armorSetId: string

  override get maxStackSize(): number {
    return 1
  }

  override get tags(): ReadonlyArray<string> {
    return ['armor', `armor_${this.armorSlot}`]
  }
}

/** Type guard: is `item` an armor piece? */
export function isArmorItem(item: IItem | null | undefined): item is ArmorItem {
  return item instanceof ArmorItem
}
