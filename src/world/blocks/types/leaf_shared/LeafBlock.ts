import type { IWorld } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { PERSISTENT_PLACED_METADATA_BIT } from '../../BlockFacing.ts'

/**
 * Seconds between decay checks (declare as `tickInterval` in subclass
 * properties). Combined with the scheduler's jitter this paces the cascade so
 * a canopy melts over a few seconds instead of popping.
 */
export const LEAF_DECAY_TICK_INTERVAL = 4.0

/** All leaf block IDs - decay connectivity flows through any of these. */
const LEAF_BLOCK_IDS: ReadonlySet<number> = new Set([
  BlockIds.OAK_LEAVES,
  BlockIds.PINE_NEEDLES,
  BlockIds.REDWOOD_LEAVES,
  BlockIds.SNOWY_PINE_NEEDLES,
])

/** Log block IDs that sustain leaves. Any log sustains any leaf type. */
const LOG_BLOCK_IDS: ReadonlySet<number> = new Set([
  BlockIds.OAK_LOG,
  BlockIds.PINE_LOG,
  BlockIds.REDWOOD_LOG,
])

/**
 * Max leaf-path distance to a sustaining log. Sized for the widest canopy:
 * pine cones reach radius 4 from the trunk, redwood leaf clusters radius 5
 * around branch logs.
 */
const MAX_LOG_SEARCH_DISTANCE = 6

/** The 6 face-adjacent neighbor offsets used for connectivity. */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
]

/**
 * Base class for decaying foliage (oak leaves, pine needles, redwood leaves).
 *
 * Leaves that can no longer reach a log through connected leaf blocks remove
 * themselves, so felled trees don't leave floating canopies. Subclasses must
 * declare `tickInterval: LEAF_DECAY_TICK_INTERVAL` in their properties -
 * ScheduledBlockTicks then queues a decay check whenever a neighboring block
 * changes, and each decayed leaf re-queues its own neighbors, cascading the
 * melt across the canopy.
 *
 * Player-placed leaves are exempt: onPlace sets a metadata bit so builds made
 * of leaf blocks never rot away.
 */
export abstract class LeafBlock extends TransparentBlock {
  /** Mark player-placed leaves as persistent so they never decay. */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    world.setBlockMetadata?.(x, y, z, metadata | PERSISTENT_PLACED_METADATA_BIT)
  }

  /**
   * Decay if no log is reachable through connected leaves. Always returns
   * false (dormant): a surviving leaf is re-queued by the next nearby block
   * change, and a decayed leaf is gone.
   */
  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    if ((metadata & PERSISTENT_PLACED_METADATA_BIT) !== 0) return false

    if (this.isLogReachable(world, x, y, z)) return false

    world.setBlock(x, y, z, BlockIds.AIR)
    return false
  }

  /**
   * BFS from this leaf through connected leaf blocks, looking for any log
   * within MAX_LOG_SEARCH_DISTANCE steps. Coordinates are walked as numbers
   * relative to the origin to avoid BigInt churn in the hot loop.
   */
  private isLogReachable(world: IWorld, originX: bigint, originY: bigint, originZ: bigint): boolean {
    const getBlockId = (dx: number, dy: number, dz: number): number =>
      world.getBlockId
        ? world.getBlockId(originX + BigInt(dx), originY + BigInt(dy), originZ + BigInt(dz))
        : world.getBlock(originX + BigInt(dx), originY + BigInt(dy), originZ + BigInt(dz)).properties.id

    const visited = new Set<number>()
    // Pack signed offsets (each within ±MAX_LOG_SEARCH_DISTANCE) into one int.
    const packKey = (dx: number, dy: number, dz: number): number =>
      (dx + 8) | ((dy + 8) << 5) | ((dz + 8) << 10)

    const queue: Array<[number, number, number, number]> = [[0, 0, 0, 0]]
    visited.add(packKey(0, 0, 0))

    for (let head = 0; head < queue.length; head++) {
      const [dx, dy, dz, dist] = queue[head]

      for (const [ox, oy, oz] of NEIGHBOR_OFFSETS) {
        const nx = dx + ox
        const ny = dy + oy
        const nz = dz + oz
        const key = packKey(nx, ny, nz)
        if (visited.has(key)) continue
        visited.add(key)

        const blockId = getBlockId(nx, ny, nz)
        if (LOG_BLOCK_IDS.has(blockId)) return true
        if (dist + 1 < MAX_LOG_SEARCH_DISTANCE && LEAF_BLOCK_IDS.has(blockId)) {
          queue.push([nx, ny, nz, dist + 1])
        }
      }
    }

    return false
  }
}
