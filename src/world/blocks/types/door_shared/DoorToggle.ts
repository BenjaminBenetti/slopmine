import type { BlockId, IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'

/**
 * Toggle table entry for one door block variant.
 */
export interface IDoorToggleEntry {
  /** The id this variant becomes when toggled (closed <-> open). */
  readonly toggledId: BlockId
  /** Y offset to the partner half: +1n for lower halves, -1n for upper halves. */
  readonly partnerDy: bigint
  /** The two ids the partner half may currently have (closed and open). */
  readonly partnerIds: readonly [BlockId, BlockId]
}

function buildDoorTogglePairs(): ReadonlyMap<BlockId, IDoorToggleEntry> {
  const map = new Map<BlockId, IDoorToggleEntry>()

  const defineWoodDoor = (
    lower: BlockId,
    upper: BlockId,
    lowerOpen: BlockId,
    upperOpen: BlockId
  ): void => {
    map.set(lower, { toggledId: lowerOpen, partnerDy: 1n, partnerIds: [upper, upperOpen] })
    map.set(lowerOpen, { toggledId: lower, partnerDy: 1n, partnerIds: [upper, upperOpen] })
    map.set(upper, { toggledId: upperOpen, partnerDy: -1n, partnerIds: [lower, lowerOpen] })
    map.set(upperOpen, { toggledId: upper, partnerDy: -1n, partnerIds: [lower, lowerOpen] })
  }

  defineWoodDoor(
    BlockIds.OAK_DOOR,
    BlockIds.OAK_DOOR_UPPER,
    BlockIds.OAK_DOOR_OPEN,
    BlockIds.OAK_DOOR_UPPER_OPEN
  )
  defineWoodDoor(
    BlockIds.PINE_DOOR,
    BlockIds.PINE_DOOR_UPPER,
    BlockIds.PINE_DOOR_OPEN,
    BlockIds.PINE_DOOR_UPPER_OPEN
  )
  defineWoodDoor(
    BlockIds.REDWOOD_DOOR,
    BlockIds.REDWOOD_DOOR_UPPER,
    BlockIds.REDWOOD_DOOR_OPEN,
    BlockIds.REDWOOD_DOOR_UPPER_OPEN
  )

  return map
}

/**
 * All 12 door block ids mapped to their toggle entries (3 woods x 4 variants).
 * main.ts iterates this to register E-key actions with blockActionRegistry.
 */
export const DOOR_TOGGLE_PAIRS: ReadonlyMap<BlockId, IDoorToggleEntry> = buildDoorTogglePairs()

/**
 * Toggle a door half (and its partner half) between closed and open.
 *
 * Works when invoked on either half: the partner is located from which id
 * was toggled (lower -> cell above, upper -> cell below). setBlock is called
 * WITHOUT the metadata argument so the existing facing metadata is preserved
 * (WorldManager only overwrites metadata when the argument is provided).
 *
 * @returns true if the block at (x, y, z) was a door variant and was toggled.
 */
export function toggleDoor(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
  const blockId = world.getBlockId?.(x, y, z) ?? world.getBlock(x, y, z).properties.id
  const entry = DOOR_TOGGLE_PAIRS.get(blockId)
  if (!entry) return false

  // Swap this half (metadata omitted -> facing preserved)
  world.setBlock(x, y, z, entry.toggledId)

  // Swap the partner half in the same operation
  const partnerY = y + entry.partnerDy
  const partnerId =
    world.getBlockId?.(x, partnerY, z) ?? world.getBlock(x, partnerY, z).properties.id
  if (entry.partnerIds.includes(partnerId)) {
    const partnerEntry = DOOR_TOGGLE_PAIRS.get(partnerId)
    if (partnerEntry) {
      world.setBlock(x, partnerY, z, partnerEntry.toggledId)
    }
  }

  return true
}
