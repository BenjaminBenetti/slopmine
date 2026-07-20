import type { IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'

/**
 * Runtime pine tree construction for sapling growth.
 *
 * Reimplements the cone math from PineTreeFeature (worker-side worldgen):
 * - single-block trunk, height 7-13
 * - canopy cone starts at max(2, floor(height * 0.35)) up the trunk
 * - widest ring radius = 2 + floor(height / 6)
 * - rings widen every 2 layers going down, leaf tip above the trunk top
 *
 * Unlike the worldgen feature this runs on the main thread through
 * world.setBlock, and does NOT need to be deterministic per position -
 * Math.random is fine for the height roll.
 *
 * Every setBlock call passes metadata 0 EXPLICITLY: setBlock preserves the
 * cell's previous metadata when the argument is omitted, and the sapling cell
 * carries the persistent-placed bit (bit 7). A grown tree must have clean
 * metadata so it can be felled and its canopy can decay naturally.
 */

/** Minimum trunk height (matches pine biome worldgen settings). */
export const PINE_MIN_TRUNK_HEIGHT = 7
/** Maximum trunk height (matches pine biome worldgen settings). */
export const PINE_MAX_TRUNK_HEIGHT = 13

/** Roll a random trunk height in [PINE_MIN_TRUNK_HEIGHT, PINE_MAX_TRUNK_HEIGHT]. */
export function rollPineTrunkHeight(): number {
  return (
    PINE_MIN_TRUNK_HEIGHT +
    Math.floor(Math.random() * (PINE_MAX_TRUNK_HEIGHT - PINE_MIN_TRUNK_HEIGHT + 1))
  )
}

/** Read a block ID without the full block-instance lookup when possible. */
function getBlockIdAt(world: IWorld, x: bigint, y: bigint, z: bigint): number {
  return world.getBlockId
    ? world.getBlockId(x, y, z)
    : world.getBlock(x, y, z).properties.id
}

/** True if the cell is air or any leaf-type block (growable-through). */
function isAirOrLeaves(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
  const block = world.getBlock(x, y, z)
  if (block.properties.id === BlockIds.AIR) return true
  return block.properties.tags.includes(BlockTags.LEAVES)
}

/**
 * Check the vertical column the trunk will occupy: every cell from 1 to
 * trunkHeight + 1 blocks above the sapling must be air or leaves.
 */
export function hasPineGrowthClearance(
  world: IWorld,
  x: bigint,
  y: bigint,
  z: bigint,
  trunkHeight: number
): boolean {
  for (let dy = 1; dy <= trunkHeight + 1; dy++) {
    if (!isAirOrLeaves(world, x, y + BigInt(dy), z)) return false
  }
  return true
}

/**
 * Build a full pine tree with its base (first trunk log) at (x, y, z).
 * The base cell may be the sapling itself - it is overwritten by the trunk.
 * Logs overwrite air/leaves/the sapling; leaves are placed only into air.
 */
export function buildPineTree(
  world: IWorld,
  x: bigint,
  y: bigint,
  z: bigint,
  trunkHeight: number
): void {
  // Bottom ~third of the trunk stays bare
  const canopyStartDy = Math.max(2, Math.floor(trunkHeight * 0.35))
  // Taller pines get slightly wider cones
  const maxRadius = 2 + Math.floor(trunkHeight / 6)

  // Trunk (dy 0 replaces the sapling cell; metadata 0 clears its bit 7)
  for (let dy = 0; dy < trunkHeight; dy++) {
    const by = y + BigInt(dy)
    if (dy === 0 || isAirOrLeaves(world, x, by, z)) {
      world.setBlock(x, by, z, BlockIds.PINE_LOG, 0)
    }
  }

  // Leaf tip directly above the trunk top
  const tipY = y + BigInt(trunkHeight)
  if (getBlockIdAt(world, x, tipY, z) === BlockIds.AIR) {
    world.setBlock(x, tipY, z, BlockIds.PINE_NEEDLES, 0)
  }

  // Conical canopy: rings widen every two layers going down the trunk
  for (let dy = canopyStartDy; dy < trunkHeight; dy++) {
    const by = y + BigInt(dy)
    const depthFromTop = trunkHeight - 1 - dy
    const radius = Math.min(maxRadius, 1 + Math.floor(depthFromTop / 2))

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0) continue

        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > radius + 0.5) continue

        const bx = x + BigInt(dx)
        const bz = z + BigInt(dz)
        if (getBlockIdAt(world, bx, by, bz) === BlockIds.AIR) {
          world.setBlock(bx, by, bz, BlockIds.PINE_NEEDLES, 0)
        }
      }
    }
  }
}
