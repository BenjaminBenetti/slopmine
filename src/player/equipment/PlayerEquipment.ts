import type { IItem } from '../../items/Item.ts'
import type { IItemStack } from '../PlayerState.ts'
import { isArmorItem, type ArmorItem } from '../../items/armor/ArmorItem.ts'
import { ARMOR_SLOTS, type ArmorSlot } from '../../items/armor/ArmorTiers.ts'

export type EquipmentChangeListener = (equipment: PlayerEquipment) => void

/**
 * The player's four worn armor slots (head, chest, legs, feet).
 *
 * Slot indices follow ARMOR_SLOTS (0 = head ... 3 = feet). Stacks are always
 * a single armor piece of the slot's type. Worn armor is separate from the
 * inventory: it survives death and is persisted under the 'equipment'
 * player-data key (see setupArmorSystem).
 */
export class PlayerEquipment {
  private readonly stacks: (IItemStack | null)[] = ARMOR_SLOTS.map(() => null)
  private readonly listeners = new Set<EquipmentChangeListener>()

  /** Number of equipment slots (4). */
  get size(): number {
    return this.stacks.length
  }

  /** Slot type of a slot index. */
  slotAt(index: number): ArmorSlot {
    return ARMOR_SLOTS[index]
  }

  /** Slot index of a slot type. */
  indexOf(slot: ArmorSlot): number {
    return ARMOR_SLOTS.indexOf(slot)
  }

  /** Stack in a slot index (null = empty). */
  getStack(index: number): IItemStack | null {
    return this.stacks[index] ?? null
  }

  /** Armor worn in a slot (null = empty). */
  getArmor(slot: ArmorSlot): ArmorItem | null {
    const item = this.stacks[this.indexOf(slot)]?.item
    return isArmorItem(item) ? item : null
  }

  /** Whether `item` may be worn in slot `index` (an armor piece of that slot's type). */
  accepts(index: number, item: IItem): boolean {
    return isArmorItem(item) && item.armorSlot === ARMOR_SLOTS[index]
  }

  /**
   * Put a stack into slot `index` (null clears it). Stacks that don't fit the
   * slot are refused (returns false). Callers keep the previous stack.
   */
  setStack(index: number, stack: IItemStack | null): boolean {
    if (index < 0 || index >= this.stacks.length) return false
    if (stack && !this.accepts(index, stack.item)) return false
    this.stacks[index] = stack ? { item: stack.item, count: 1 } : null
    this.emitChange()
    return true
  }

  /** Wear `armor` in its slot; returns the piece it replaced (or null). */
  equip(armor: ArmorItem): ArmorItem | null {
    const index = this.indexOf(armor.armorSlot)
    const previous = this.stacks[index]?.item ?? null
    this.stacks[index] = { item: armor, count: 1 }
    this.emitChange()
    return isArmorItem(previous) ? previous : null
  }

  /** Total armor points of everything worn. */
  get armorPoints(): number {
    let total = 0
    for (const stack of this.stacks) {
      if (stack && isArmorItem(stack.item)) total += stack.item.armorPoints
    }
    return total
  }

  /** Set id when all four slots hold pieces of one set, else null. */
  get fullSetId(): string | null {
    let setId: string | null = null
    for (const stack of this.stacks) {
      if (!stack || !isArmorItem(stack.item)) return null
      if (setId === null) setId = stack.item.armorSetId
      else if (setId !== stack.item.armorSetId) return null
    }
    return setId
  }

  /** Item ids per slot, in slot order (null = empty). */
  getItemIds(): (string | null)[] {
    return this.stacks.map((stack) => stack?.item.id ?? null)
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  onChange(listener: EquipmentChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener(this)
    }
  }
}
