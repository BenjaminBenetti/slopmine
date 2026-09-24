import { MESH_SUB_CHUNK_SIZE, SHELL_REGIONS } from '../../world/meshing/MeshNeighborShell.ts'

/**
 * A sub-chunk padded with its one-block neighbour shell: 34³ block ids and
 * light bytes, y-major like sub-chunk storage. Built once per mesh job so every
 * face / AO / smooth-light lookup is a plain array read.
 */

const SIZE = MESH_SUB_CHUNK_SIZE
export const PAD_SIZE = SIZE + 2

export const PAD_STRIDE_X = 1
export const PAD_STRIDE_Z = PAD_SIZE
export const PAD_STRIDE_Y = PAD_SIZE * PAD_SIZE
export const PAD_VOLUME = PAD_SIZE * PAD_SIZE * PAD_SIZE

/** Padded index of local cell (0, 0, 0). */
export const PAD_ORIGIN = PAD_STRIDE_Y + PAD_STRIDE_Z + PAD_STRIDE_X

/** Block id stored in cells of a missing (not loaded) neighbour sub-chunk. */
export const MISSING_BLOCK = 0xFFFF

/** Padded coordinate for a shell axis offset and region-local coordinate. */
function padCoord(offset: number, local: number): number {
  return offset < 0 ? 0 : offset > 0 ? SIZE + 1 : local + 1
}

export class PaddedVolume {
  readonly blocks = new Uint16Array(PAD_VOLUME)
  readonly light = new Uint8Array(PAD_VOLUME)

  /**
   * Fill from the sub-chunk's own arrays plus its neighbour shell (see
   * MeshNeighborShell.ts). Regions missing from presentMask get MISSING_BLOCK
   * and light 0 (light there is never read: samples reuse the face's light).
   */
  fill(
    centerBlocks: Uint16Array,
    centerLight: Uint8Array,
    shellBlocks: Uint16Array,
    shellLight: Uint8Array,
    presentMask: number
  ): void {
    const { blocks, light } = this

    for (let y = 0; y < SIZE; y++) {
      for (let z = 0; z < SIZE; z++) {
        const src = (y * SIZE + z) * SIZE
        const dst = PAD_ORIGIN + y * PAD_STRIDE_Y + z * PAD_STRIDE_Z
        blocks.set(centerBlocks.subarray(src, src + SIZE), dst)
        light.set(centerLight.subarray(src, src + SIZE), dst)
      }
    }

    for (const region of SHELL_REGIONS) {
      const present = (presentMask & (1 << region.index)) !== 0
      let src = region.offset
      for (let ry = 0; ry < region.sizeY; ry++) {
        const py = padCoord(region.dy, ry)
        for (let rz = 0; rz < region.sizeZ; rz++) {
          const rowBase = py * PAD_STRIDE_Y + padCoord(region.dz, rz) * PAD_STRIDE_Z
          for (let rx = 0; rx < region.sizeX; rx++) {
            const dst = rowBase + padCoord(region.dx, rx)
            if (present) {
              blocks[dst] = shellBlocks[src]
              light[dst] = shellLight[src]
            } else {
              blocks[dst] = MISSING_BLOCK
              light[dst] = 0
            }
            src++
          }
        }
      }
    }
  }
}
