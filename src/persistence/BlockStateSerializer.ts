/**
 * Block state serialization/deserialization utilities.
 * Converts between runtime block state and serialized format for persistence.
 */

import type { SerializedSlot, SerializedBlockState } from './PersistenceTypes.ts'
import type { IBlockState } from '../world/blockstate/interfaces/IBlockState.ts'
import type { IItemStack } from '../player/PlayerState.ts'
import { createItemFromId } from './ItemRegistry.ts'
import { ForgeBlockState } from '../world/blocks/types/forge/ForgeBlockState.ts'
import { ApothecaryWorkbenchState } from '../world/blocks/types/apothecary_workbench/ApothecaryWorkbenchState.ts'
import { WoodworkingBenchState } from '../world/blocks/types/woodworking_bench/WoodworkingBenchState.ts'

/**
 * Type for block state deserializer factory functions.
 */
type BlockStateDeserializer = (
  position: { x: bigint; y: bigint; z: bigint },
  data: unknown
) => IBlockState

/**
 * Registry of block state deserializers by state type.
 */
const blockStateDeserializers: Map<string, BlockStateDeserializer> = new Map()

/**
 * Register a deserializer for a block state type.
 * Call this at module load time for each block state class.
 */
export function registerBlockStateDeserializer(
  stateType: string,
  deserializer: BlockStateDeserializer
): void {
  blockStateDeserializers.set(stateType, deserializer)
}

/**
 * Serialize a single item stack to a slot format.
 * Reuses the same format as player inventory.
 */
export function serializeSlot(stack: IItemStack | null): SerializedSlot | null {
  if (!stack) return null
  return {
    itemId: stack.item.id,
    count: stack.count,
  }
}

/**
 * Deserialize a slot back to an item stack.
 * Returns null if the item ID is unknown.
 */
export function deserializeSlot(slot: SerializedSlot | null): IItemStack | null {
  if (!slot) return null

  const item = createItemFromId(slot.itemId)
  if (!item) {
    console.warn(`[BlockStateSerializer] Failed to deserialize item: ${slot.itemId}`)
    return null
  }

  return {
    item,
    count: slot.count,
  }
}

/**
 * Serialize a block state to a persistable format.
 * Returns null if the state has no data to persist.
 */
export function serializeBlockState(state: IBlockState): SerializedBlockState | null {
  // Skip if no data to persist
  if (!state.hasData()) {
    return null
  }

  const data = state.serialize()
  if (data === undefined) {
    return null
  }

  return {
    stateType: state.stateType,
    position: {
      x: state.position.x.toString(),
      y: state.position.y.toString(),
      z: state.position.z.toString(),
    },
    data,
  }
}

/**
 * Deserialize a block state from saved data.
 * Creates a new block state instance and populates it with saved data.
 * Returns null if the state type is unknown.
 */
export function deserializeBlockState(
  serialized: SerializedBlockState
): IBlockState | null {
  const deserializer = blockStateDeserializers.get(serialized.stateType)
  if (!deserializer) {
    console.warn(`[BlockStateSerializer] Unknown block state type: ${serialized.stateType}`)
    return null
  }

  const position = {
    x: BigInt(serialized.position.x),
    y: BigInt(serialized.position.y),
    z: BigInt(serialized.position.z),
  }

  const state = deserializer(position, serialized.data)
  return state
}

/**
 * Get all block states from the BlockStateManager that have data to persist.
 * Groups states by chunk coordinate for efficient storage.
 */
export function getBlockStatesToPersist(
  states: IterableIterator<IBlockState>
): SerializedBlockState[] {
  const result: SerializedBlockState[] = []

  for (const state of states) {
    const serialized = serializeBlockState(state)
    if (serialized) {
      result.push(serialized)
    }
  }

  return result
}

// ============================================================================
// Register deserializers for known block state types
// ============================================================================

// Register Forge deserializer
registerBlockStateDeserializer('forge', (position, data) => {
  const state = new ForgeBlockState(position)
  state.deserialize(data)
  return state
})

// Register Apothecary Workbench deserializer
registerBlockStateDeserializer('apothecary_workbench', (position, data) => {
  const state = new ApothecaryWorkbenchState(position)
  state.deserialize(data)
  return state
})

// Register Woodworking Bench deserializer
registerBlockStateDeserializer('woodworking_bench', (position, data) => {
  const state = new WoodworkingBenchState(position)
  state.deserialize(data)
  return state
})
