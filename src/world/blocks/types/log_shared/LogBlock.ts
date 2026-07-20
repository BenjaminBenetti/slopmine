import type { IWorld } from '../../../interfaces/IBlock.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { PERSISTENT_PLACED_METADATA_BIT } from '../../BlockFacing.ts'

/**
 * Seconds between support checks (declare as `tickInterval` in subclass
 * properties). Kept fast so a chopped trunk visibly "falls" moments after the
 * cut, well before the slower leaf decay starts eating the canopy.
 */
export const LOG_SUPPORT_TICK_INTERVAL = 0.5

/** All log block IDs - support connectivity flows through any of these. */
const LOG_BLOCK_IDS: ReadonlySet<number> = new Set([
  BlockIds.OAK_LOG,
  BlockIds.PINE_LOG,
  BlockIds.REDWOOD_LOG,
])

/** Leaf block IDs - foliage never supports a log. */
const LEAF_BLOCK_IDS: ReadonlySet<number> = new Set([
  BlockIds.OAK_LEAVES,
  BlockIds.PINE_NEEDLES,
  BlockIds.REDWOOD_LEAVES,
  BlockIds.SNOWY_PINE_NEEDLES,
])

/**
 * Safety cap on connected-log cluster size. A cluster that exceeds this is
 * treated as supported (no collapse) rather than paying an unbounded search.
 * Sized well above the largest generated tree (redwood mega trees run a few
 * hundred logs including branches and roots).
 */
const MAX_CLUSTER_SIZE = 1024

/** BFS offsets are packed arithmetically; offsets beyond this bail out safe. */
const COORD_RANGE = 512

/** The 6 face-adjacent neighbor offsets used for connectivity. */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
]

/**
 * Base class for tree trunk logs (oak, pine, redwood).
 *
 * Implements tree felling: a log whose entire connected log cluster touches
 * nothing but logs, leaves, and non-solid blocks is unsupported - the whole
 * cluster breaks at once, scattering each log's drops. Chopping the bottom of
 * a trunk therefore drops the entire tree, and the orphaned canopy then
 * melts via leaf decay (see leaf_shared/LeafBlock.ts). A cluster still
 * touching any solid non-log non-leaf block (ground, a cliff face, a plank
 * wall) is supported and stays.
 *
 * Subclasses must declare `tickInterval: LOG_SUPPORT_TICK_INTERVAL` in their
 * properties - ScheduledBlockTicks then queues a support check whenever a
 * neighboring block changes at runtime.
 *
 * Player-placed logs are exempt: onPlace sets a metadata bit, and a cluster
 * containing any persistent log never collapses, so log builds (floating
 * arches included) are safe.
 */
export abstract class LogBlock extends SolidBlock {
  /** Mark player-placed logs as persistent so their cluster never collapses. */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    world.setBlockMetadata?.(x, y, z, metadata | PERSISTENT_PLACED_METADATA_BIT)
  }

  /**
   * Break the whole connected log cluster if nothing supports it. Always
   * returns false (dormant): a supported log is re-queued by the next nearby
   * block change, and a collapsed one is gone.
   */
  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const cluster = this.collectUnsupportedCluster(world, x, y, z)
    if (!cluster) return false

    // Timber! Break every log in the cluster, scattering its drops.
    for (const [dx, dy, dz] of cluster) {
      const bx = x + BigInt(dx)
      const by = y + BigInt(dy)
      const bz = z + BigInt(dz)
      const block = world.getBlock(bx, by, bz)
      const drops = block.getDrops?.() ?? []
      world.setBlock(bx, by, bz, BlockIds.AIR)
      world.spawnBlockDrops?.(bx, by, bz, drops)
    }
    return false
  }

  /**
   * BFS the connected log cluster containing (x, y, z). Returns the cluster's
   * offsets if it is unsupported, or null if it is supported - i.e. any
   * cluster log touches a solid non-log non-leaf block, is player-placed,
   * or the cluster exceeds the safety cap.
   */
  private collectUnsupportedCluster(
    world: IWorld,
    originX: bigint,
    originY: bigint,
    originZ: bigint
  ): Array<readonly [number, number, number]> | null {
    const getBlockId = (dx: number, dy: number, dz: number): number =>
      world.getBlockId
        ? world.getBlockId(originX + BigInt(dx), originY + BigInt(dy), originZ + BigInt(dz))
        : world.getBlock(originX + BigInt(dx), originY + BigInt(dy), originZ + BigInt(dz)).properties.id

    // Arithmetic packing (offsets stay far below COORD_RANGE thanks to the
    // cluster cap; 32-bit bitwise packing can't fit this range).
    const packKey = (dx: number, dy: number, dz: number): number =>
      (dx + COORD_RANGE) + (dy + COORD_RANGE) * 1024 + (dz + COORD_RANGE) * 1024 * 1024

    const visited = new Set<number>()
    const cluster: Array<readonly [number, number, number]> = [[0, 0, 0]]
    visited.add(packKey(0, 0, 0))

    for (let head = 0; head < cluster.length; head++) {
      const [dx, dy, dz] = cluster[head]

      // A player-placed log anchors the whole cluster
      const metadata = world.getMetadata?.(
        originX + BigInt(dx), originY + BigInt(dy), originZ + BigInt(dz)
      ) ?? 0
      if ((metadata & PERSISTENT_PLACED_METADATA_BIT) !== 0) return null

      for (const [ox, oy, oz] of NEIGHBOR_OFFSETS) {
        const nx = dx + ox
        const ny = dy + oy
        const nz = dz + oz
        if (Math.abs(nx) >= COORD_RANGE || Math.abs(ny) >= COORD_RANGE || Math.abs(nz) >= COORD_RANGE) {
          return null
        }
        const key = packKey(nx, ny, nz)
        if (visited.has(key)) continue
        visited.add(key)

        const blockId = getBlockId(nx, ny, nz)
        if (LOG_BLOCK_IDS.has(blockId)) {
          if (cluster.length >= MAX_CLUSTER_SIZE) return null
          cluster.push([nx, ny, nz])
          continue
        }
        if (LEAF_BLOCK_IDS.has(blockId)) continue

        // Any other solid block supports the cluster
        const neighbor = world.getBlock(
          originX + BigInt(nx), originY + BigInt(ny), originZ + BigInt(nz)
        )
        if (neighbor.properties.isSolid) return null
      }
    }

    return cluster
  }
}
