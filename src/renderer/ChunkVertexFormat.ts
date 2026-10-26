/**
 * Compact interleaved vertex format for greedy chunk meshes, shared by the
 * mesh worker (writer) and GreedyChunkMesh / ChunkMaterial (readers).
 *
 * 12 bytes per vertex, all Uint8 (non-normalized), in three 4-byte groups so
 * every attribute is a 4-component byte format (no CPU vertex conversion on
 * ANGLE/D3D11 or Metal):
 *
 *   bytes 0-3  `position`  x, y, z in sub-chunk local block units (0-32), and
 *                          1 when the face looks into water (caustics; read as
 *                          `aPos4.w` - the same bytes bound a second time)
 *   bytes 4-7  `aTex`      u, v in block units (texture repeats per block),
 *                          texture-array layer, face index (0-5, BlockFace order)
 *   bytes 8-11 `aLight`    sky light ×16, block light ×16 (smooth-lit, 0-240),
 *                          AO brightness ×255, quad corner (bit 0: max-u end,
 *                          bit 1: max-v end)
 *
 * Positions are local, so each mesh is placed at its sub-chunk origin. The
 * normal is derived from the face index in the vertex shader; the corner bits
 * let it grow each quad by a sub-pixel margin to close T-junction cracks.
 */

export const CHUNK_VERTEX_STRIDE = 12

export const CHUNK_VERTEX_POSITION_OFFSET = 0
export const CHUNK_VERTEX_TEX_OFFSET = 4
export const CHUNK_VERTEX_LIGHT_OFFSET = 8

/** Smooth-lit light levels are stored multiplied by this (4 fractional bits). */
export const CHUNK_LIGHT_SCALE = 16

/** Largest texture-array layer index representable in the vertex format. */
export const CHUNK_MAX_TEXTURE_LAYER = 255

/**
 * Liquid face-visibility values (GreedyMeshResponse.nonGreedyFaceVisibility):
 * bits 0-5 = face shown (BlockFace order); from this bit on, 4 bits per side
 * face (NORTH, SOUTH, EAST, WEST) give the height in eighths of a block where
 * that side face starts - its lower part lies inside a lower neighbour of the
 * same liquid. Side face f's clip is at LIQUID_SIDE_CLIP_SHIFT + 4 * (f - 2).
 */
export const LIQUID_SIDE_CLIP_SHIFT = 8
