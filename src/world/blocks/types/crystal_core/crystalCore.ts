import type { IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'

/**
 * Crystal "core" blocks: non-emitting twins of the glowing Crystal Abyss
 * crystals, written by worldgen (CrystalCoreFeature) for crystal cells with
 * no exposed face. They share their twin's texture (and its emissive texels,
 * so they look identical) and drops, but carry lightLevel 0: a spire's light
 * comes from its shell, not from thousands of buried emitters.
 *
 * When a neighbour changes at runtime (the player digs in), the scheduled
 * tick turns an exposed core back into its emitting twin.
 */

/** Emitting crystal -> its core twin. */
export const CRYSTAL_CORE_OF: ReadonlyMap<number, number> = new Map([
  [BlockIds.SPIRE_CRYSTAL, BlockIds.SPIRE_CRYSTAL_CORE],
  [BlockIds.ROSE_CRYSTAL, BlockIds.ROSE_CRYSTAL_CORE],
  [BlockIds.PRISM_CRYSTAL, BlockIds.PRISM_CRYSTAL_CORE],
])

/** Seconds between a neighbour change and the exposure check. */
export const CRYSTAL_CORE_TICK_INTERVAL = 0.25

const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
]

/**
 * Scheduled tick of a core block: if any face is now exposed (non-opaque
 * neighbour), become the emitting twin. Always goes dormant.
 */
export function exposeCrystalCore(world: IWorld, x: bigint, y: bigint, z: bigint, emittingId: number): boolean {
  for (const [dx, dy, dz] of NEIGHBORS) {
    const neighbor = world.getBlock(x + BigInt(dx), y + BigInt(dy), z + BigInt(dz))
    if (!neighbor.properties.isOpaque) {
      world.setBlock(x, y, z, emittingId)
      return false
    }
  }
  return false
}
