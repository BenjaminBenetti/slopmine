import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { SerializedSlot } from '../../../../persistence/PersistenceTypes.ts'
import { createItemFromId } from '../../../../persistence/ItemRegistry.ts'

/** Number of slots in a chest (3 rows x 9 columns) */
export const CHEST_SLOT_COUNT = 27

/**
 * Serialized chest state for persistence.
 */
export interface SerializedChestState {
  slots: (SerializedSlot | null)[]
}

// Local serialization helpers to avoid circular dependency with BlockStateSerializer
function serializeSlotLocal(stack: IItemStack | null): SerializedSlot | null {
  if (!stack) return null
  return { itemId: stack.item.id, count: stack.count }
}

function deserializeSlotLocal(slot: SerializedSlot | null): IItemStack | null {
  if (!slot) return null
  const item = createItemFromId(slot.itemId)
  if (!item) return null
  return { item, count: slot.count }
}

/**
 * Runtime state for a placed chest block.
 * Manages a 27-slot inventory (3 rows x 9 columns).
 */
export class ChestBlockState implements IBlockState {
  readonly position: IWorldCoordinate
  readonly stateType = 'chest'

  /** Inventory slots (27 total: 3 rows x 9 columns) */
  private readonly slots: (IItemStack | null)[] = new Array(CHEST_SLOT_COUNT).fill(null)

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  /**
   * Get the total number of slots.
   */
  getSlotCount(): number {
    return CHEST_SLOT_COUNT
  }

  /**
   * Get item stack at the specified slot index.
   */
  getStack(index: number): IItemStack | null {
    if (index < 0 || index >= CHEST_SLOT_COUNT) return null
    return this.slots[index]
  }

  /**
   * Set item stack at the specified slot index.
   */
  setStack(index: number, stack: IItemStack | null): void {
    if (index >= 0 && index < CHEST_SLOT_COUNT) {
      this.slots[index] = stack
    }
  }

  /**
   * Get all items to drop when the chest is broken.
   */
  getAllItems(): IItemStack[] {
    const items: IItemStack[] = []
    for (const stack of this.slots) {
      if (stack) items.push(stack)
    }
    return items
  }

  // ============================================================================
  // Persistence Methods
  // ============================================================================

  /**
   * Check if this state has meaningful data to persist.
   * Returns true if any slots have items.
   */
  hasData(): boolean {
    for (const slot of this.slots) {
      if (slot) return true
    }
    return false
  }

  /**
   * Serialize state to a plain object for persistence.
   */
  serialize(): SerializedChestState | undefined {
    if (!this.hasData()) {
      return undefined
    }

    return {
      slots: this.slots.map(serializeSlotLocal),
    }
  }

  /**
   * Restore state from saved data.
   */
  deserialize(data: unknown): void {
    const saved = data as SerializedChestState
    if (!saved || !saved.slots) return

    for (let i = 0; i < this.slots.length && i < saved.slots.length; i++) {
      this.slots[i] = deserializeSlotLocal(saved.slots[i])
    }
  }

  onDestroy(): void {
    // Items would be dropped here - handled by caller
  }
}
