/**
 * Block state serialization/deserialization utilities.
 * Converts between runtime block state and serialized format for persistence.
 *
 * Uses the block's createState() method for deserialization, eliminating
 * the need for manual deserializer registration.
 */

import type { SerializedSlot, SerializedBlockState } from './PersistenceTypes.ts'
import type { IBlockState } from '../world/blockstate/interfaces/IBlockState.ts'
import type { IItemStack } from '../player/PlayerState.ts'
import type { IBlock } from '../world/interfaces/IBlock.ts'
import { createItemFromId } from './ItemRegistry.ts'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'

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
 * @param state The block state to serialize
 * @param block The block that owns this state (used to get block name)
 */
export function serializeBlockState(state: IBlockState, block: IBlock): SerializedBlockState | null {
  // Skip if no data to persist
  if (!state.hasData()) {
    return null
  }

  const data = state.serialize()
  if (data === undefined) {
    return null
  }

  return {
    blockName: block.properties.name,
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
 * Uses the block's createState() method to create the state instance.
 * Returns null if the block is unknown or doesn't support state.
 */
export function deserializeBlockState(
  serialized: SerializedBlockState
): IBlockState | null {
  const block = BlockRegistry.getInstance().getBlockByName(serialized.blockName)
  if (!block) {
    console.warn(`[BlockStateSerializer] Unknown block: ${serialized.blockName}`)
    return null
  }

  if (!block.createState) {
    console.warn(`[BlockStateSerializer] Block '${serialized.blockName}' has no createState method`)
    return null
  }

  const position = {
    x: BigInt(serialized.position.x),
    y: BigInt(serialized.position.y),
    z: BigInt(serialized.position.z),
  }

  const state = block.createState(position)
  state.deserialize(serialized.data)
  return state
}

/**
 * Interface for providing block lookup during serialization.
 */
export interface IBlockProvider {
  getBlock(x: bigint, y: bigint, z: bigint): IBlock
}

/**
 * Get all block states from the BlockStateManager that have data to persist.
 * @param states Iterator of all block states
 * @param blockProvider World or other provider that can look up blocks by position
 */
export function getBlockStatesToPersist(
  states: IterableIterator<IBlockState>,
  blockProvider: IBlockProvider
): SerializedBlockState[] {
  const result: SerializedBlockState[] = []

  for (const state of states) {
    const block = blockProvider.getBlock(state.position.x, state.position.y, state.position.z)
    const serialized = serializeBlockState(state, block)
    if (serialized) {
      result.push(serialized)
    }
  }

  return result
}
