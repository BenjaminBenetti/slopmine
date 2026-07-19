import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { SerializedSlot } from '../../../../persistence/PersistenceTypes.ts'
import { serializeSlot, deserializeSlot } from '../../../../persistence/BlockStateSerializer.ts'

/** Number of display slots on a shelf */
export const SHELF_SLOT_COUNT = 3

/**
 * Serialized shelf state for persistence.
 */
export interface SerializedShelfState {
  slots: (SerializedSlot | null)[]
}

/**
 * Runtime state for a placed shelf block.
 * Manages a 3-slot display inventory shared by all wood shelf variants.
 *
 * The `revision` counter is bumped on every content change so the
 * ShelfBlockEntity can cheaply poll for changes and rebuild its
 * in-world display meshes.
 */
export class ShelfBlockState implements IBlockState {
  readonly position: IWorldCoordinate
  readonly stateType = 'shelf'

  /**
   * Monotonically increasing revision counter.
   * Bumped on every setStack and on deserialize so the shelf's
   * block entity knows to rebuild its display meshes.
   */
  revision = 0

  /** Display slots (3 total) */
  private readonly slots: (IItemStack | null)[] = new Array(SHELF_SLOT_COUNT).fill(null)

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  /**
   * Get the total number of slots.
   */
  getSlotCount(): number {
    return SHELF_SLOT_COUNT
  }

  /**
   * Get item stack at the specified slot index.
   */
  getStack(index: number): IItemStack | null {
    if (index < 0 || index >= SHELF_SLOT_COUNT) return null
    return this.slots[index]
  }

  /**
   * Set item stack at the specified slot index.
   * Bumps the revision counter so the block entity rebuilds its display.
   */
  setStack(index: number, stack: IItemStack | null): void {
    if (index >= 0 && index < SHELF_SLOT_COUNT) {
      this.slots[index] = stack
      this.revision++
    }
  }

  /**
   * Remove empty (count <= 0) stacks after a partial content transfer.
   * Bumps the revision counter so the block entity rebuilds its display.
   */
  compactSlots(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const stack = this.slots[i]
      if (stack && stack.count <= 0) {
        this.slots[i] = null
      }
    }
    this.revision++
  }

  /**
   * Get all items to drop when the shelf is broken.
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
  serialize(): SerializedShelfState | undefined {
    if (!this.hasData()) {
      return undefined
    }

    return {
      slots: this.slots.map(serializeSlot),
    }
  }

  /**
   * Restore state from saved data.
   */
  deserialize(data: unknown): void {
    const saved = data as SerializedShelfState
    if (!saved || !saved.slots) return

    for (let i = 0; i < this.slots.length && i < saved.slots.length; i++) {
      this.slots[i] = deserializeSlot(saved.slots[i])
    }

    // Loaded contents differ from the freshly-constructed empty state
    this.revision++
  }

  onDestroy(): void {
    // Items would be dropped here - handled by caller
  }
}
