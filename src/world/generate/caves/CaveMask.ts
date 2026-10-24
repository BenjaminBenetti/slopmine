import { SUB_CHUNK_HEIGHT } from '../../interfaces/IChunk.ts'

/**
 * The cave mask of a sub-chunk and its 1-block shell (CaveCarver
 * .carveSubChunkWithMask): what carving made of every cell, so cave dressing
 * (CaveDressing.ts) can tell floors, ceilings and walls apart right up to
 * the sub-chunk's faces - a neighbouring sub-chunk's cave is known without
 * its blocks. Index: cellIndex(x + 1, y + 1, z + 1) for sub-chunk-local x/y/z
 * in -1..32.
 */
export const CAVE_MASK_SIZE = SUB_CHUNK_HEIGHT + 2

/** Rock (below the surface, not carved). */
export const CAVE_MASK_ROCK = 0
/** Cave air (carved). */
export const CAVE_MASK_AIR = 1
/** Carved and flooded (lava / swamp water below the flood level). */
export const CAVE_MASK_FLOODED = 2
/** Open air above the column's surface. */
export const CAVE_MASK_OPEN = 3

/** Mask index of sub-chunk-local (x, y, z), each -1..32. */
export function caveMaskIndex(x: number, y: number, z: number): number {
  return ((y + 1) * CAVE_MASK_SIZE + (z + 1)) * CAVE_MASK_SIZE + (x + 1)
}
