import type { BlockId } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'

/**
 * Minimal world contract for the fence gate toggle.
 * WorldManager satisfies this directly.
 */
export interface IFenceGateWorld {
  getBlockId?(x: bigint, y: bigint, z: bigint): BlockId
  getBlock?(x: bigint, y: bigint, z: bigint): { properties: { id: BlockId } }
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId, metadata?: number): boolean
}

/**
 * Bidirectional closed <-> open block id pairs for all fence gate woods.
 * Used by main.ts to wire blockActionRegistry entries data-driven.
 */
export const GATE_TOGGLE_PAIRS: Readonly<Record<number, BlockId>> = {
  [BlockIds.OAK_FENCE_GATE]: BlockIds.OAK_FENCE_GATE_OPEN,
  [BlockIds.OAK_FENCE_GATE_OPEN]: BlockIds.OAK_FENCE_GATE,
  [BlockIds.PINE_FENCE_GATE]: BlockIds.PINE_FENCE_GATE_OPEN,
  [BlockIds.PINE_FENCE_GATE_OPEN]: BlockIds.PINE_FENCE_GATE,
  [BlockIds.REDWOOD_FENCE_GATE]: BlockIds.REDWOOD_FENCE_GATE_OPEN,
  [BlockIds.REDWOOD_FENCE_GATE_OPEN]: BlockIds.REDWOOD_FENCE_GATE,
}

/**
 * Toggle a fence gate between closed and open at the given position.
 * The metadata argument is deliberately OMITTED on setBlock so the
 * existing facing metadata is preserved (WorldManager keeps metadata
 * when the arg is undefined).
 *
 * @returns true if a gate was toggled, false if the block is not a gate
 */
export function toggleFenceGate(
  world: IFenceGateWorld,
  x: bigint,
  y: bigint,
  z: bigint
): boolean {
  const currentId = world.getBlockId
    ? world.getBlockId(x, y, z)
    : world.getBlock?.(x, y, z).properties.id

  if (currentId === undefined) return false

  const otherId = GATE_TOGGLE_PAIRS[currentId]
  if (otherId === undefined) return false

  // No metadata arg - preserves facing
  world.setBlock(x, y, z, otherId)
  return true
}
