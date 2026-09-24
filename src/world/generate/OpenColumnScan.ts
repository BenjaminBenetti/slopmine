import { BlockRegistry, getBlock } from '../blocks/BlockRegistry.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'

const COLUMNS = CHUNK_SIZE_X * CHUNK_SIZE_Z

/**
 * Lookup by block id: 1 for ground blocks - greedy-meshed cubes, which end
 * the view down a column - 0 otherwise. Liquids don't count: full detail
 * draws them see-through, showing whatever lies beneath. Neither do plants,
 * torches and other custom geometry.
 */
export function buildGroundBlockLookup(): Uint8Array {
  const ids = BlockRegistry.getInstance().getAllBlockIds()
  const lookup = new Uint8Array(Math.max(0, ...ids) + 1)
  for (const id of ids) {
    if (id === 0) continue
    const block = getBlock(id)
    if (!block.properties.isLiquid && block.isGreedyMeshable()) lookup[id] = 1
  }
  return lookup
}

/**
 * True if some column of a sub-chunk (y-major block ids) holds no ground
 * block at all: its ground lies in a lower sub-chunk. At the bottom of a
 * column's surface band that means a ravine or cave mouth - dry or flooded -
 * cuts below it.
 */
export function hasOpenColumn(blocks: Uint16Array, groundBlocks: Uint8Array): boolean {
  for (let column = 0; column < COLUMNS; column++) {
    let open = true
    for (let y = SUB_CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (groundBlocks[blocks[y * COLUMNS + column]] === 1) {
        open = false
        break
      }
    }
    if (open) return true
  }
  return false
}
