import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'

/**
 * The one-block shell around a sub-chunk that a mesh job needs: 6 face slabs,
 * 12 edge lines and 8 corner cells of block ids AND light, copied from the 26
 * neighbouring sub-chunks. The mesher pads the sub-chunk with it into a 34³
 * volume so smooth lighting / AO samples never branch on "which neighbour?".
 *
 * Shared contract between the main-thread payload builder (buildNeighborShell,
 * used by WorldManager) and the greedy mesh worker (which unpacks the regions
 * into its padded volume).
 *
 * Layout: the 26 regions are concatenated in neighbour-index order, where
 * neighbour index = (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1) (13 = the sub-chunk
 * itself, skipped). A region spans the neighbour's cells adjacent to this
 * sub-chunk: along an axis with offset −1 only coordinate 31, +1 only
 * coordinate 0, 0 the full 0..31 range. Cells inside a region are y-major
 * (y, then z, then x), matching sub-chunk storage.
 *
 * presentMask bit (neighbour index) is set when that neighbour's data is in the
 * shell. Unset regions are "missing": the mesher never fabricates light for
 * them (faces toward a missing face-neighbour are culled, AO/smooth-light
 * samples there reuse the face's own light). The sub-chunk must be remeshed
 * when any missing neighbour loads.
 */

/** Edge length of a (cubic) sub-chunk. The shell layout assumes a cube. */
export const MESH_SUB_CHUNK_SIZE = 32

if (CHUNK_SIZE_X !== MESH_SUB_CHUNK_SIZE || CHUNK_SIZE_Z !== MESH_SUB_CHUNK_SIZE || SUB_CHUNK_HEIGHT !== MESH_SUB_CHUNK_SIZE) {
  throw new Error('MeshNeighborShell assumes 32x32x32 sub-chunks')
}

/** Neighbour index of the sub-chunk itself (never a shell region). */
export const SHELL_CENTER_INDEX = 13

/** Light byte used for cells above the top of the world: open sky, no block light. */
const OPEN_SKY_LIGHT = 0xF0

export interface ShellRegion {
  /** Neighbour index, (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1); also its presentMask bit. */
  readonly index: number
  readonly dx: number
  readonly dy: number
  readonly dz: number
  /** First cell of this region in the shell arrays. */
  readonly offset: number
  /** Region extent along x / y / z (1 or 32). */
  readonly sizeX: number
  readonly sizeY: number
  readonly sizeZ: number
}

function buildRegions(): { regions: ShellRegion[]; cellCount: number } {
  const regions: ShellRegion[] = []
  let offset = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const index = (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1)
        if (index === SHELL_CENTER_INDEX) continue
        const sizeX = dx === 0 ? MESH_SUB_CHUNK_SIZE : 1
        const sizeY = dy === 0 ? MESH_SUB_CHUNK_SIZE : 1
        const sizeZ = dz === 0 ? MESH_SUB_CHUNK_SIZE : 1
        regions.push({ index, dx, dy, dz, offset, sizeX, sizeY, sizeZ })
        offset += sizeX * sizeY * sizeZ
      }
    }
  }
  return { regions, cellCount: offset }
}

const layout = buildRegions()

/** The 26 shell regions in layout order. */
export const SHELL_REGIONS: readonly ShellRegion[] = layout.regions

/** Total shell cells: 6 × 1024 + 12 × 32 + 8 = 6536. */
export const SHELL_CELL_COUNT = layout.cellCount

/** presentMask with every neighbour present (@internal test hook: the mesh harnesses build requests with it). */
export const SHELL_ALL_PRESENT_MASK = SHELL_REGIONS.reduce((mask, r) => mask | (1 << r.index), 0)

/** The 6 face-neighbour indices (their absence culls faces). */
export const SHELL_FACE_INDICES: readonly number[] = SHELL_REGIONS
  .filter((r) => Math.abs(r.dx) + Math.abs(r.dy) + Math.abs(r.dz) === 1)
  .map((r) => r.index)

/** Minimal view of a loaded sub-chunk the builder copies from. */
export interface ShellSource {
  getBlockData(): Uint16Array
  getLightData(): Uint8Array
}

export interface NeighborShell {
  readonly blocks: Uint16Array
  readonly light: Uint8Array
  /** Bit (neighbour index) set = region filled with real data. */
  readonly presentMask: number
}

/**
 * Coordinate inside the neighbour sub-chunk for an axis offset and a
 * region-local coordinate: −1 → 31 (its far side), +1 → 0, 0 → unchanged.
 */
function sourceCoord(offset: number, local: number): number {
  return offset < 0 ? MESH_SUB_CHUNK_SIZE - 1 : offset > 0 ? 0 : local
}

function copyRegion(region: ShellRegion, source: ShellSource, blocks: Uint16Array, light: Uint8Array): void {
  const srcBlocks = source.getBlockData()
  const srcLight = source.getLightData()
  const rowStride = MESH_SUB_CHUNK_SIZE
  const layerStride = MESH_SUB_CHUNK_SIZE * MESH_SUB_CHUNK_SIZE

  // Horizontal face slabs above/below are one contiguous y-layer.
  if (region.sizeX === MESH_SUB_CHUNK_SIZE && region.sizeZ === MESH_SUB_CHUNK_SIZE) {
    const start = sourceCoord(region.dy, 0) * layerStride
    blocks.set(srcBlocks.subarray(start, start + layerStride), region.offset)
    light.set(srcLight.subarray(start, start + layerStride), region.offset)
    return
  }

  let dst = region.offset
  for (let y = 0; y < region.sizeY; y++) {
    const sy = sourceCoord(region.dy, y)
    for (let z = 0; z < region.sizeZ; z++) {
      const rowStart = sy * layerStride + sourceCoord(region.dz, z) * rowStride
      if (region.sizeX === MESH_SUB_CHUNK_SIZE) {
        blocks.set(srcBlocks.subarray(rowStart, rowStart + rowStride), dst)
        light.set(srcLight.subarray(rowStart, rowStart + rowStride), dst)
        dst += rowStride
      } else {
        const src = rowStart + sourceCoord(region.dx, 0)
        blocks[dst] = srcBlocks[src]
        light[dst] = srcLight[src]
        dst++
      }
    }
  }
}

/**
 * Build the neighbour shell for the sub-chunk at vertical index `subY`.
 *
 * @param getNeighbor Returns the loaded neighbour at the given offset, or
 *   null/undefined when it isn't loaded. Only called for in-world positions.
 *   Cells above the top of the world are filled as open sky (present); below
 *   the bottom they are missing.
 */
export function buildNeighborShell(
  subY: number,
  getNeighbor: (dx: number, dy: number, dz: number) => ShellSource | null | undefined
): NeighborShell {
  const blocks = new Uint16Array(SHELL_CELL_COUNT)
  const light = new Uint8Array(SHELL_CELL_COUNT)
  let presentMask = 0

  for (const region of SHELL_REGIONS) {
    const neighborSubY = subY + region.dy
    if (neighborSubY >= SUB_CHUNK_COUNT) {
      const cells = region.sizeX * region.sizeY * region.sizeZ
      light.fill(OPEN_SKY_LIGHT, region.offset, region.offset + cells)
      presentMask |= 1 << region.index
      continue
    }
    if (neighborSubY < 0) continue

    const source = getNeighbor(region.dx, region.dy, region.dz)
    if (!source) continue
    copyRegion(region, source, blocks, light)
    presentMask |= 1 << region.index
  }

  return { blocks, light, presentMask }
}
