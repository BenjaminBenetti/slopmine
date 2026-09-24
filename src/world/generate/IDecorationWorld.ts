import type { BlockId } from '../interfaces/IBlock.ts'

/**
 * World access for main-thread decoration passes (trees, mushrooms, cacti).
 *
 * WorldGenerator hands each pass its own writer (WorldManager
 * .createDecorationWriter()): setBlock writes the block array directly and
 * defers relighting to the writer's flush, skipping the gameplay side effects
 * of WorldManager.setBlock (ticks, liquid wake-ups, block entities,
 * persistence marks). An explicit writer - not a global "batch mode" - so a
 * pass suspended across frames never changes what the player's own edits do.
 * WorldManager itself satisfies this interface too (legacy full-chunk paths).
 */
export interface IDecorationWorld {
  getBlockId(x: bigint, y: bigint, z: bigint): BlockId
  setBlock(x: bigint, y: bigint, z: bigint, blockId: BlockId, metadata?: number): boolean
}
