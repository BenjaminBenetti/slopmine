import type { BlockId, IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'

/**
 * Closed ↔ open block id pairs for all wood trapdoors.
 * Data-driven so main.ts can register the E-key toggle action for every
 * trapdoor id centrally via blockActionRegistry:
 *
 *   for (const { closedId, openId } of TRAPDOOR_TOGGLE_PAIRS) {
 *     blockActionRegistry.register(closedId, (x, y, z) => toggleTrapdoor(world, x, y, z))
 *     blockActionRegistry.register(openId, (x, y, z) => toggleTrapdoor(world, x, y, z))
 *   }
 */
export const TRAPDOOR_TOGGLE_PAIRS: ReadonlyArray<{
  closedId: BlockId
  openId: BlockId
}> = [
  { closedId: BlockIds.OAK_TRAPDOOR, openId: BlockIds.OAK_TRAPDOOR_OPEN },
  { closedId: BlockIds.PINE_TRAPDOOR, openId: BlockIds.PINE_TRAPDOOR_OPEN },
  { closedId: BlockIds.REDWOOD_TRAPDOOR, openId: BlockIds.REDWOOD_TRAPDOOR_OPEN },
]

// Bidirectional lookup: closed → open and open → closed.
const toggleTargets: ReadonlyMap<BlockId, BlockId> = (() => {
  const map = new Map<BlockId, BlockId>()
  for (const { closedId, openId } of TRAPDOOR_TOGGLE_PAIRS) {
    map.set(closedId, openId)
    map.set(openId, closedId)
  }
  return map
})()

/**
 * Get the counterpart block id for a trapdoor (closed → open, open → closed).
 * Returns undefined for non-trapdoor ids.
 */
export function getTrapdoorToggleTarget(blockId: BlockId): BlockId | undefined {
  return toggleTargets.get(blockId)
}

/**
 * Toggle a trapdoor between closed and open at the given world position.
 * The metadata argument to setBlock is deliberately omitted: WorldManager
 * preserves existing metadata when it is not provided, so the facing set at
 * placement survives the id swap.
 *
 * Returns true if the block was a trapdoor and was toggled.
 */
export function toggleTrapdoor(
  world: IWorld,
  x: bigint,
  y: bigint,
  z: bigint
): boolean {
  const currentId = world.getBlock(x, y, z).properties.id
  const targetId = toggleTargets.get(currentId)
  if (targetId === undefined) {
    return false
  }

  world.setBlock(x, y, z, targetId)
  return true
}
