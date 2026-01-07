/**
 * Inventory serialization/deserialization utilities.
 * Converts between runtime inventory state and serialized format.
 */

import type { SerializedInventory, SerializedSlot } from './PersistenceTypes.ts'
import type {
  PlayerInventoryState,
  IToolbarState,
  IInventoryGridState,
  IItemStack,
} from '../player/PlayerState.ts'
import { createItemFromId } from './ItemRegistry.ts'

const INVENTORY_FORMAT_VERSION = 1

/**
 * Serialize a single item stack to a slot.
 */
function serializeSlot(stack: IItemStack | null): SerializedSlot | null {
  if (!stack) return null
  return {
    itemId: stack.item.id,
    count: stack.count,
  }
}

/**
 * Serialize the player's inventory state to a JSON-compatible object.
 */
export function serializeInventory(state: PlayerInventoryState): SerializedInventory {
  return {
    version: INVENTORY_FORMAT_VERSION,
    toolbar: {
      selectedIndex: state.toolbar.selectedIndex,
      slots: state.toolbar.slots.map(serializeSlot),
    },
    inventory: {
      width: state.inventory.width,
      height: state.inventory.height,
      slots: state.inventory.slots.map(serializeSlot),
    },
  }
}

/**
 * Deserialize a single slot back to an item stack.
 * Returns null if the item ID is unknown.
 */
function deserializeSlot(slot: SerializedSlot | null): IItemStack | null {
  if (!slot) return null

  const item = createItemFromId(slot.itemId)
  if (!item) {
    console.warn(`Failed to deserialize item: ${slot.itemId}`)
    return null
  }

  return {
    item,
    count: slot.count,
  }
}

/**
 * Deserialize inventory state from saved data into existing state objects.
 * Modifies the toolbar and inventory in place.
 *
 * @param data The serialized inventory data
 * @param toolbar The toolbar state to populate
 * @param inventory The inventory grid state to populate
 */
export function deserializeInventory(
  data: SerializedInventory,
  toolbar: IToolbarState,
  inventory: IInventoryGridState
): void {
  // Validate version
  if (data.version !== INVENTORY_FORMAT_VERSION) {
    console.warn(
      `Inventory format version mismatch: expected ${INVENTORY_FORMAT_VERSION}, got ${data.version}`
    )
    // Continue anyway - try to load what we can
  }

  // Restore toolbar slots
  const toolbarSlotCount = Math.min(data.toolbar.slots.length, toolbar.size)
  for (let i = 0; i < toolbarSlotCount; i++) {
    const stack = deserializeSlot(data.toolbar.slots[i])
    toolbar.setStack(i, stack)
  }

  // Restore selected slot
  if (data.toolbar.selectedIndex >= 0 && data.toolbar.selectedIndex < toolbar.size) {
    toolbar.selectSlot(data.toolbar.selectedIndex)
  }

  // Restore inventory grid slots
  const inventorySlotCount = Math.min(
    data.inventory.slots.length,
    inventory.width * inventory.height
  )
  for (let i = 0; i < inventorySlotCount; i++) {
    const stack = deserializeSlot(data.inventory.slots[i])
    inventory.setStack(i, stack)
  }

  console.log(
    `Loaded inventory: ${toolbarSlotCount} toolbar slots, ${inventorySlotCount} inventory slots`
  )
}

/**
 * Check if a serialized inventory is valid and can be loaded.
 */
export function validateSerializedInventory(data: unknown): data is SerializedInventory {
  if (!data || typeof data !== 'object') return false

  const inv = data as Record<string, unknown>

  // Check required fields
  if (typeof inv.version !== 'number') return false
  if (!inv.toolbar || typeof inv.toolbar !== 'object') return false
  if (!inv.inventory || typeof inv.inventory !== 'object') return false

  const toolbar = inv.toolbar as Record<string, unknown>
  const inventory = inv.inventory as Record<string, unknown>

  // Check toolbar structure
  if (typeof toolbar.selectedIndex !== 'number') return false
  if (!Array.isArray(toolbar.slots)) return false

  // Check inventory structure
  if (typeof inventory.width !== 'number') return false
  if (typeof inventory.height !== 'number') return false
  if (!Array.isArray(inventory.slots)) return false

  return true
}
