import { BlockIds } from '../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'

/**
 * Layers at the bottom of the surface layer's stone fill (the Hell cavern's
 * rock ceiling, HELL_CEILING_Y and up) that generate as dark basalt. Surface
 * caves and ores start higher (Y 146 / 156), so these layers are plain stone.
 */
export const HELL_CEILING_BAND_DEPTH = 4

const LAYER_SIZE = CHUNK_SIZE_X * CHUNK_SIZE_Z

/**
 * Turn the stone of the cavern ceiling band into basalt (worker post-pass,
 * after every other block-writing phase and before the light pass).
 *
 * From inside the Hell cavern the ceiling is lit only by the biome's ambient
 * light floor; pale surface stone (sRGB ~0.47) read as a bright slab overhead,
 * twice as bright as the haze around it, where Hell rock is ~0.2. Basalt
 * (~0.18, already in the texture array) reads as dark, distant cavern rock -
 * and, digging down from the surface, as the sign that Hell is right below.
 * Only STONE is replaced (anything else a generator put there stays). Digging
 * through is unchanged in practice: basalt needs the same pickaxe (force 1)
 * and mines a little faster than stone.
 *
 * @param blocks sub-chunk block ids (Y-major: y * 1024 + z * 32 + x)
 * @param minWorldY world Y of the sub-chunk's bottom layer
 * @param ceilingY lowest Y of the surface fill (sea level - terrain thickness)
 */
export function applyHellCeilingBand(blocks: Uint16Array, minWorldY: number, ceilingY: number): void {
  const from = Math.max(ceilingY, minWorldY) - minWorldY
  const to = Math.min(ceilingY + HELL_CEILING_BAND_DEPTH, minWorldY + SUB_CHUNK_HEIGHT) - minWorldY
  for (let localY = from; localY < to; localY++) {
    const end = (localY + 1) * LAYER_SIZE
    for (let i = localY * LAYER_SIZE; i < end; i++) {
      if (blocks[i] === BlockIds.STONE) blocks[i] = BlockIds.BASALT
    }
  }
}
