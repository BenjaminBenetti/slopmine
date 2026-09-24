import { CHUNK_SIZE_X } from '../interfaces/IChunk.ts'
import { linearToSrgbByte, srgbByteToLinear } from './srgb.ts'
import {
  LOD_REGION_CHUNKS,
  LOD_SIDE_NORTH,
  LOD_SIDE_SOUTH,
  LOD_SIDE_WEST,
  LOD_SIDE_EAST,
  lodNeighborIndex,
  type LodCellSize,
  type LodPaletteData,
  type LodTileSummary,
} from './LodTypes.ts'

/**
 * Region heightfield mesher for the far-terrain LOD (pure, runs in the LOD
 * workers).
 *
 * A region is 8x8 chunks meshed as one blocky heightfield, each chunk
 * sampled at its cell size - one size for the region (cellSize), or one per
 * chunk (chunkCellSizes: the region is then meshed as a 1-block grid in which
 * a coarse chunk's cells are replicated, so seams between sizes are ordinary
 * chunk seams and coarse chunks still merge into cell-sized or larger quads):
 *
 * - Tops: one quad per greedy-merged run of cells with equal (height, colour).
 *   Never merged across chunk borders, so every triangle belongs to exactly
 *   one chunk and the per-chunk handoff mask can hide it.
 * - Walls: on each cell edge whose neighbour is lower, from the neighbour's
 *   height up to the cell's, merged along the edge.
 * - Seam skirts: chunk-border walls reach CHUNK_SEAM_SKIRT below the lower
 *   side - and below both sides' lake beds, which full-detail water shows
 *   through - and exist even between equal heights, so seams against
 *   full-detail chunks never show sky; region-border skirts reach below the
 *   neighbouring chunk's lowest surface, covering any height the next region
 *   can render.
 * - T-junction repair: every vertex lying inside another quad's edge is
 *   inserted into that edge, so the mesh has no cracks at cell, chunk or
 *   region-internal edges.
 *
 * Output vertices: Uint16 xyz in half-block units (region-local x/z, world
 * y) and Uint8 sRGB colour with the chunk slot in the 4th byte.
 */

/** Blocks the chunk-border walls reach below the lower side. */
const CHUNK_SEAM_SKIRT = 2
/** Blocks region-border skirts reach below the lower of the two sides. */
const REGION_SEAM_SKIRT = 2
/**
 * Seam skirts also reach at least this far below the cell top. A full-detail
 * neighbour can be cut by a ravine or cave mouth the tile knows nothing
 * about; where the cut runs into the seam, the skirt closes its end instead
 * of showing the LOD chunk's empty underside. Skirts facing terrain at least
 * as high stay hidden inside it, so the extra depth costs no vertices and
 * never shows.
 */
const CUT_SKIRT_DEPTH = 48
/** Skirt depth toward cells of unknown height (missing tile, ring edge). */
const UNKNOWN_NEIGHBOR_SKIRT = 16
/** Walls dropping at most this far show the top block's side colour; taller ones the block beneath. */
const WALL_TOP_STRIP = 2
/** Columns within this many blocks of a cell's height contribute to its colour. */
const COLOR_HEIGHT_TOLERANCE = 2
/** Low bits dropped from averaged colours (coarse cells) so similar cells still merge. */
const COLOR_QUANT_SHIFT = 2

/** Stored position units per block (see LOD_POSITION_SCALE). */
const UNITS = 2

/** Quad faces. */
const FACE_TOP = 0
const FACE_POS_X = 1
const FACE_NEG_X = 2
const FACE_POS_Z = 3
const FACE_NEG_Z = 4

/** Fields per quad record: face, plane, a0, a1, b0, b1, rgb, slot. */
const QUAD_STRIDE = 8

/**
 * Line-index packing: x and z are < 1024 half-units (10 bits), y < 2048
 * (11 bits), so a line key plus the coordinate along it fits 31 bits.
 */
const XZ_BITS = 10
const Y_BITS = 11

export interface LodMeshInput {
  readonly cellSize: LodCellSize
  /**
   * Cell size per chunk slot (local z * 8 + local x: 1, 2 or 4). Overrides
   * cellSize: each chunk is sampled at its own size and the region is meshed
   * at 1-block resolution (see meshLodRegion).
   */
  readonly chunkCellSizes?: Uint8Array
  /** Tiles by chunk slot (local z * 8 + local x); missing tiles leave holes. */
  readonly tiles: ReadonlyArray<LodTileSummary | null | undefined>
  /** Lowest surface (top or lake bed) of the chunks bordering the region (see lodNeighborIndex); 0 = unknown. */
  readonly neighborMinFloor: Int16Array
  readonly palette: LodPaletteData
}

export interface LodMeshStats {
  readonly topQuads: number
  readonly wallQuads: number
  readonly triangles: number
  /** Vertices added on quad edges to remove T-junctions. */
  readonly insertedVertices: number
  /** Quads fanned around an added centre vertex. */
  readonly centreFans: number
}

export interface LodMeshOutput {
  readonly positions: Uint16Array
  readonly colors: Uint8Array
  readonly indices: Uint16Array | Uint32Array
  readonly vertexCount: number
  readonly chunkMaskLo: number
  readonly chunkMaskHi: number
  readonly stats: LodMeshStats
}

// ==================== sRGB <-> linear ====================

// Lookup tables (hot path) built from the shared transfer functions (srgb.ts)
const SRGB_TO_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  SRGB_TO_LINEAR[i] = srgbByteToLinear(i)
}

const LINEAR_TO_SRGB_STEPS = 4096
const LINEAR_TO_SRGB = new Uint8Array(LINEAR_TO_SRGB_STEPS + 1)
for (let i = 0; i <= LINEAR_TO_SRGB_STEPS; i++) {
  LINEAR_TO_SRGB[i] = linearToSrgbByte(i / LINEAR_TO_SRGB_STEPS)
}

function linearToSrgb(value: number): number {
  return LINEAR_TO_SRGB[Math.round(Math.max(0, Math.min(1, value)) * LINEAR_TO_SRGB_STEPS)]
}

function paletteRgb(colors: Uint8Array, blockId: number): number {
  const i = blockId * 3
  return (colors[i] << 16) | (colors[i + 1] << 8) | colors[i + 2]
}

// ==================== Growable buffers ====================

class IntBuffer {
  data: Int32Array
  length = 0

  constructor(initialCapacity: number) {
    this.data = new Int32Array(initialCapacity)
  }

  reserve(extra: number): void {
    if (this.length + extra <= this.data.length) return
    let capacity = this.data.length * 2
    while (capacity < this.length + extra) capacity *= 2
    const next = new Int32Array(capacity)
    next.set(this.data.subarray(0, this.length))
    this.data = next
  }
}

// ==================== Mesher ====================

/** Per-cell heightfield of a region at one cell size. */
interface CellGrid {
  /** Cells per region side. */
  readonly n: number
  /** Cells per chunk side. */
  readonly perChunk: number
  /** Cell top (Y of the top face); 0 = no data. */
  readonly height: Int16Array
  /** Lowest floor (lake bed; the top where there's no liquid) of the cell's columns. */
  readonly floor: Int16Array
  readonly topRgb: Int32Array
  readonly sideRgb: Int32Array
  /** Side colour of the block under the surface (walls taller than WALL_TOP_STRIP). */
  readonly deepRgb: Int32Array
}

/**
 * Mesh one region. Cell size must divide the chunk size (1, 2 or 4).
 */
export function meshLodRegion(input: LodMeshInput): LodMeshOutput {
  const grid = buildCellGrid(input)
  // Grid cell size in blocks: 1 with mixed per-chunk sizes (coarse cells replicated)
  const gridCell = gridCellSize(input)
  const quads = new IntBuffer(4096)
  let topQuads = 0
  let wallQuads = 0
  let chunkMaskLo = 0
  let chunkMaskHi = 0

  for (let slot = 0; slot < LOD_REGION_CHUNKS * LOD_REGION_CHUNKS; slot++) {
    if (!input.tiles[slot]) continue
    const tops = emitTops(grid, slot, gridCell, quads)
    const walls = emitWalls(grid, slot, gridCell, input.neighborMinFloor, quads)
    topQuads += tops
    wallQuads += walls
    if (tops + walls > 0) {
      if (slot < 32) chunkMaskLo |= 1 << slot
      else chunkMaskHi |= 1 << (slot - 32)
    }
  }

  const mesh = triangulate(quads)
  return {
    positions: mesh.positions,
    colors: mesh.colors,
    indices: mesh.indices,
    vertexCount: mesh.vertexCount,
    chunkMaskLo: chunkMaskLo >>> 0,
    chunkMaskHi: chunkMaskHi >>> 0,
    stats: {
      topQuads,
      wallQuads,
      triangles: mesh.indices.length / 3,
      insertedVertices: mesh.insertedVertices,
      centreFans: mesh.centreFans,
    },
  }
}

/**
 * Cell size of the mesher's grid: the region's, the chunks' common size, or 1
 * when the chunks' sizes differ (coarse cells are then replicated).
 */
function gridCellSize(input: LodMeshInput): LodCellSize {
  if (!input.chunkCellSizes) return input.cellSize
  let size: LodCellSize | 0 = 0
  for (let slot = 0; slot < input.tiles.length; slot++) {
    if (!input.tiles[slot]) continue
    const c = chunkCellSize(input, slot)
    if (size === 0) size = c
    else if (c !== size) return 1
  }
  return size === 0 ? 1 : size
}

/** A chunk's cell size: its per-chunk size (1, 2 or 4; anything else = 1) or the region's. */
function chunkCellSize(input: LodMeshInput, slot: number): LodCellSize {
  if (!input.chunkCellSizes) return input.cellSize
  const c = input.chunkCellSizes[slot]
  return c === 2 || c === 4 ? c : 1
}

/**
 * Downsample every tile to cells of its chunk's size: height is the max top
 * (c <= 2) or the 75th percentile (c = 4, keeps sparse tree tops from
 * bloating whole cells); colours are linear averages over the columns near
 * that height. A cell coarser than the grid is written to all the grid cells
 * it covers.
 */
function buildCellGrid(input: LodMeshInput): CellGrid {
  const gridCell = gridCellSize(input)
  const perChunk = CHUNK_SIZE_X / gridCell
  const n = LOD_REGION_CHUNKS * perChunk
  const height = new Int16Array(n * n)
  const floor = new Int16Array(n * n)
  const topRgb = new Int32Array(n * n)
  const sideRgb = new Int32Array(n * n)
  const deepRgb = new Int32Array(n * n)
  const { top: topColors, side: sideColors } = input.palette
  const samples = new Int16Array(16)

  for (let slot = 0; slot < input.tiles.length; slot++) {
    const tile = input.tiles[slot]
    if (!tile) continue
    const c = chunkCellSize(input, slot)
    const cellsPerChunk = CHUNK_SIZE_X / c
    const replicate = c / gridCell
    const quantMask = c === 1 ? 0xff : (0xff << COLOR_QUANT_SHIFT) & 0xff
    const chunkCellX = (slot % LOD_REGION_CHUNKS) * perChunk
    const chunkCellZ = Math.floor(slot / LOD_REGION_CHUNKS) * perChunk

    for (let cz = 0; cz < cellsPerChunk; cz++) {
      for (let cx = 0; cx < cellsPerChunk; cx++) {
        // First grid cell of this (possibly coarser) cell
        const cell = (chunkCellZ + cz * replicate) * n + chunkCellX + cx * replicate

        if (c === 1) {
          const column = cz * CHUNK_SIZE_X + cx
          const h = tile.top[column]
          if (h === 0) continue
          const block = tile.topBlock[column]
          const under = tile.underBlock[column]
          height[cell] = h
          floor[cell] = tile.floor[column] > 0 ? Math.min(h, tile.floor[column]) : h
          topRgb[cell] = paletteRgb(topColors, block)
          sideRgb[cell] = paletteRgb(sideColors, block)
          deepRgb[cell] = paletteRgb(sideColors, under !== 0 ? under : block)
          continue
        }

        // Height: max (c = 2) or 75th percentile (c = 4) of known columns
        let count = 0
        let lowest = Infinity
        for (let dz = 0; dz < c; dz++) {
          for (let dx = 0; dx < c; dx++) {
            const column = (cz * c + dz) * CHUNK_SIZE_X + cx * c + dx
            const h = tile.top[column]
            if (h === 0) continue
            samples[count++] = h
            lowest = Math.min(lowest, tile.floor[column] > 0 ? tile.floor[column] : h)
          }
        }
        if (count === 0) continue
        const sorted = samples.subarray(0, count).sort()
        const h = c <= 2 ? sorted[count - 1] : sorted[Math.floor((count - 1) * 0.75)]
        height[cell] = h
        floor[cell] = Math.min(h, lowest)

        // Colours: linear average of the columns near that height
        let tr = 0, tg = 0, tb = 0, sr = 0, sg = 0, sb = 0, dr = 0, dg = 0, db = 0
        let weight = 0
        for (let dz = 0; dz < c; dz++) {
          for (let dx = 0; dx < c; dx++) {
            const column = (cz * c + dz) * CHUNK_SIZE_X + cx * c + dx
            const columnTop = tile.top[column]
            if (columnTop === 0 || Math.abs(columnTop - h) > COLOR_HEIGHT_TOLERANCE) continue
            const block = tile.topBlock[column]
            const under = tile.underBlock[column]
            const bi = block * 3
            const di = (under !== 0 ? under : block) * 3
            tr += SRGB_TO_LINEAR[topColors[bi]]
            tg += SRGB_TO_LINEAR[topColors[bi + 1]]
            tb += SRGB_TO_LINEAR[topColors[bi + 2]]
            sr += SRGB_TO_LINEAR[sideColors[bi]]
            sg += SRGB_TO_LINEAR[sideColors[bi + 1]]
            sb += SRGB_TO_LINEAR[sideColors[bi + 2]]
            dr += SRGB_TO_LINEAR[sideColors[di]]
            dg += SRGB_TO_LINEAR[sideColors[di + 1]]
            db += SRGB_TO_LINEAR[sideColors[di + 2]]
            weight++
          }
        }
        // The chosen height always comes from a column, so weight >= 1
        const inv = 1 / weight
        topRgb[cell] = packQuantized(tr * inv, tg * inv, tb * inv, quantMask)
        sideRgb[cell] = packQuantized(sr * inv, sg * inv, sb * inv, quantMask)
        deepRgb[cell] = packQuantized(dr * inv, dg * inv, db * inv, quantMask)
        if (replicate > 1) replicateCell(n, cell, replicate, height, floor, topRgb, sideRgb, deepRgb)
      }
    }
  }

  return { n, perChunk, height, floor, topRgb, sideRgb, deepRgb }
}

/** Copy grid cell `cell` over the replicate x replicate grid cells it stands for. */
function replicateCell(
  n: number,
  cell: number,
  replicate: number,
  height: Int16Array,
  floor: Int16Array,
  topRgb: Int32Array,
  sideRgb: Int32Array,
  deepRgb: Int32Array
): void {
  for (let dz = 0; dz < replicate; dz++) {
    for (let dx = 0; dx < replicate; dx++) {
      if (dx === 0 && dz === 0) continue
      const target = cell + dz * n + dx
      height[target] = height[cell]
      floor[target] = floor[cell]
      topRgb[target] = topRgb[cell]
      sideRgb[target] = sideRgb[cell]
      deepRgb[target] = deepRgb[cell]
    }
  }
}

function packQuantized(r: number, g: number, b: number, mask: number): number {
  return ((linearToSrgb(r) & mask) << 16) | ((linearToSrgb(g) & mask) << 8) | (linearToSrgb(b) & mask)
}

function pushQuad(
  quads: IntBuffer,
  face: number,
  plane: number,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  rgb: number,
  slot: number
): void {
  quads.reserve(QUAD_STRIDE)
  const d = quads.data
  let i = quads.length
  d[i++] = face
  d[i++] = plane
  d[i++] = a0
  d[i++] = a1
  d[i++] = b0
  d[i++] = b1
  d[i++] = rgb
  d[i++] = slot
  quads.length = i
}

/** Greedy-merge one chunk's top faces by (height, colour). Returns quads emitted. */
function emitTops(grid: CellGrid, slot: number, c: number, quads: IntBuffer): number {
  const { n, perChunk, height, topRgb } = grid
  const originX = (slot % LOD_REGION_CHUNKS) * perChunk
  const originZ = Math.floor(slot / LOD_REGION_CHUNKS) * perChunk
  const used = new Uint8Array(perChunk * perChunk)
  const scale = c * UNITS
  let emitted = 0

  for (let z = 0; z < perChunk; z++) {
    for (let x = 0; x < perChunk; x++) {
      if (used[z * perChunk + x]) continue
      const cell = (originZ + z) * n + originX + x
      const h = height[cell]
      if (h === 0) continue
      const rgb = topRgb[cell]

      let width = 1
      while (x + width < perChunk && !used[z * perChunk + x + width] &&
        height[cell + width] === h && topRgb[cell + width] === rgb) {
        width++
      }
      let depth = 1
      grow: while (z + depth < perChunk) {
        const row = cell + depth * n
        for (let k = 0; k < width; k++) {
          if (used[(z + depth) * perChunk + x + k] || height[row + k] !== h || topRgb[row + k] !== rgb) break grow
        }
        depth++
      }
      for (let dz = 0; dz < depth; dz++) {
        for (let dx = 0; dx < width; dx++) used[(z + dz) * perChunk + x + dx] = 1
      }

      pushQuad(
        quads, FACE_TOP, h * UNITS,
        (originX + x) * scale, (originX + x + width) * scale,
        (originZ + z) * scale, (originZ + z + depth) * scale,
        rgb, slot
      )
      emitted++
    }
  }
  return emitted
}

/** Result slot of computeWall (avoids an allocation per cell edge). */
const wallSpec = { bottom: 0, rgb: 0 }

/**
 * Wall on the edge of cell (gx, gz) toward (gx + dx, gz + dz). Returns false
 * when there is none; otherwise fills wallSpec with the wall's bottom Y and
 * colour (its top is the cell's height).
 */
function computeWall(
  grid: CellGrid,
  gx: number,
  gz: number,
  dx: number,
  dz: number,
  chunkLocalX: number,
  chunkLocalZ: number,
  neighborMinFloor: Int16Array
): boolean {
  const { n, perChunk, height, floor } = grid
  const cell = gz * n + gx
  const h = height[cell]
  if (h === 0) return false
  const nx = gx + dx
  const nz = gz + dz
  let bottom: number
  let drop: number
  if (nx >= 0 && nx < n && nz >= 0 && nz < n) {
    const hn = height[nz * n + nx]
    if (hn === 0) {
      bottom = Math.min(h - UNKNOWN_NEIGHBOR_SKIRT, floor[cell] - CHUNK_SEAM_SKIRT)
      drop = Infinity
    } else if (Math.floor(nx / perChunk) === chunkLocalX && Math.floor(nz / perChunk) === chunkLocalZ) {
      if (hn >= h) return false
      bottom = hn
      drop = h - hn
    } else {
      // Chunk border: skirt below the lower side, even between equal heights,
      // and below both lake beds (full-detail water shows what is under it)
      if (hn > h) return false
      bottom = Math.min(hn, floor[cell], floor[nz * n + nx]) - CHUNK_SEAM_SKIRT
      bottom = Math.min(bottom, h - CUT_SKIRT_DEPTH)
      drop = h - hn
    }
  } else {
    // Region border: reach below anything the neighbouring chunk can render
    const side = dx === 1 ? LOD_SIDE_EAST : dx === -1 ? LOD_SIDE_WEST : dz === 1 ? LOD_SIDE_SOUTH : LOD_SIDE_NORTH
    const along = dx !== 0 ? chunkLocalZ : chunkLocalX
    const neighborMin = neighborMinFloor[lodNeighborIndex(side, along)]
    if (neighborMin > 0) {
      bottom = Math.min(h, floor[cell], neighborMin) - REGION_SEAM_SKIRT
      bottom = Math.min(bottom, h - CUT_SKIRT_DEPTH)
      drop = h - neighborMin
    } else {
      bottom = Math.min(h - UNKNOWN_NEIGHBOR_SKIRT, floor[cell] - REGION_SEAM_SKIRT)
      drop = Infinity
    }
  }
  wallSpec.bottom = Math.max(0, bottom)
  wallSpec.rgb = drop <= WALL_TOP_STRIP ? grid.sideRgb[cell] : grid.deepRgb[cell]
  return true
}

/** Wall faces in emission order, with their outward cell step. */
const WALL_DIRECTIONS: ReadonlyArray<{ readonly face: number; readonly dx: number; readonly dz: number }> = [
  { face: FACE_POS_X, dx: 1, dz: 0 },
  { face: FACE_NEG_X, dx: -1, dz: 0 },
  { face: FACE_POS_Z, dx: 0, dz: 1 },
  { face: FACE_NEG_Z, dx: 0, dz: -1 },
]

/**
 * Walls on one chunk's cell edges toward lower (or unknown) neighbours,
 * merged along each edge line. Returns quads emitted.
 */
function emitWalls(
  grid: CellGrid,
  slot: number,
  c: number,
  neighborMinFloor: Int16Array,
  quads: IntBuffer
): number {
  const { n, perChunk, height } = grid
  const chunkLocalX = slot % LOD_REGION_CHUNKS
  const chunkLocalZ = Math.floor(slot / LOD_REGION_CHUNKS)
  const originX = chunkLocalX * perChunk
  const originZ = chunkLocalZ * perChunk
  const scale = c * UNITS
  let emitted = 0

  for (const { face, dx, dz } of WALL_DIRECTIONS) {
    // Lines perpendicular to the wall normal; runs merge along each line
    for (let line = 0; line < perChunk; line++) {
      let runStart = -1
      let runH = 0
      let runBottom = 0
      let runRgb = 0
      for (let t = 0; t <= perChunk; t++) {
        let h = 0
        let b = -1
        let color = 0
        if (t < perChunk) {
          const gx = originX + (dx !== 0 ? line : t)
          const gz = originZ + (dx !== 0 ? t : line)
          if (computeWall(grid, gx, gz, dx, dz, chunkLocalX, chunkLocalZ, neighborMinFloor)) {
            h = height[gz * n + gx]
            b = wallSpec.bottom
            color = wallSpec.rgb
          }
        }
        if (runStart >= 0 && (b < 0 || h !== runH || b !== runBottom || color !== runRgb)) {
          // Close the run [runStart, t)
          const planeCell = dx !== 0 ? originX + line + (dx > 0 ? 1 : 0) : originZ + line + (dz > 0 ? 1 : 0)
          const alongOrigin = dx !== 0 ? originZ : originX
          const t0 = (alongOrigin + runStart) * scale
          const t1 = (alongOrigin + t) * scale
          const y0 = runBottom * UNITS
          const y1 = runH * UNITS
          if (dx !== 0) {
            // X-facing: a = y range, b = z range
            pushQuad(quads, face, planeCell * scale, y0, y1, t0, t1, runRgb, slot)
          } else {
            // Z-facing: a = x range, b = y range
            pushQuad(quads, face, planeCell * scale, t0, t1, y0, y1, runRgb, slot)
          }
          emitted++
          runStart = -1
        }
        if (b >= 0 && runStart < 0) {
          runStart = t
          runH = h
          runBottom = b
          runRgb = color
        }
      }
    }
  }
  return emitted
}

// ==================== Triangulation with T-junction repair ====================

interface Triangulation {
  readonly positions: Uint16Array
  readonly colors: Uint8Array
  readonly indices: Uint16Array | Uint32Array
  readonly vertexCount: number
  readonly insertedVertices: number
  readonly centreFans: number
}

/**
 * Corners of a quad record in counter-clockwise order seen from its front
 * face (outward normal), as flat [x, y, z] × 4.
 */
function quadCorners(d: Int32Array, q: number, out: Int32Array): void {
  const face = d[q]
  const plane = d[q + 1]
  const a0 = d[q + 2], a1 = d[q + 3], b0 = d[q + 4], b1 = d[q + 5]
  switch (face) {
    case FACE_TOP: // a = x, b = z; normal +Y
      set4(out, a0, plane, b0, a0, plane, b1, a1, plane, b1, a1, plane, b0)
      break
    case FACE_POS_X: // a = y, b = z; normal +X
      set4(out, plane, a0, b0, plane, a1, b0, plane, a1, b1, plane, a0, b1)
      break
    case FACE_NEG_X: // normal -X
      set4(out, plane, a0, b0, plane, a0, b1, plane, a1, b1, plane, a1, b0)
      break
    case FACE_POS_Z: // a = x, b = y; normal +Z
      set4(out, a0, b0, plane, a1, b0, plane, a1, b1, plane, a0, b1, plane)
      break
    default: // FACE_NEG_Z; normal -Z
      set4(out, a0, b0, plane, a0, b1, plane, a1, b1, plane, a1, b0, plane)
      break
  }
}

function set4(
  out: Int32Array,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number
): void {
  out[0] = x0; out[1] = y0; out[2] = z0
  out[3] = x1; out[4] = y1; out[5] = z1
  out[6] = x2; out[7] = y2; out[8] = z2
  out[9] = x3; out[10] = y3; out[11] = z3
}

/**
 * Sorted vertex coordinates along every axis-aligned line that carries quad
 * corners. A corner (x, y, z) lies on an X-line keyed (y, z), a Y-line keyed
 * (x, z) and a Z-line keyed (y, x). Each axis is one sorted array of
 * `(lineKey << bits) | coordinate`, so a line's points are a contiguous run
 * found by binary search.
 */
class LineIndex {
  private readonly sorted: Uint32Array[] = []

  constructor(quads: IntBuffer) {
    const d = quads.data
    const cornerCount = (quads.length / QUAD_STRIDE) * 4
    const corners = new Int32Array(12)
    const values = [new Uint32Array(cornerCount), new Uint32Array(cornerCount), new Uint32Array(cornerCount)]
    let n = 0
    for (let q = 0; q < quads.length; q += QUAD_STRIDE) {
      quadCorners(d, q, corners)
      for (let k = 0; k < 12; k += 3) {
        const x = corners[k], y = corners[k + 1], z = corners[k + 2]
        values[0][n] = LineIndex.xLine(y, z) + x
        values[1][n] = LineIndex.yLine(x, z) + y
        values[2][n] = LineIndex.zLine(y, x) + z
        n++
      }
    }
    for (const axisValues of values) {
      axisValues.sort()
      let w = 0
      for (let i = 0; i < axisValues.length; i++) {
        if (w === 0 || axisValues[i] !== axisValues[w - 1]) axisValues[w++] = axisValues[i]
      }
      this.sorted.push(axisValues.subarray(0, w))
    }
  }

  /** Packed base of the X-line through (y, z); add x. */
  static xLine(y: number, z: number): number {
    return ((y << XZ_BITS) | z) * (1 << XZ_BITS)
  }

  /** Packed base of the Y-line through (x, z); add y. */
  static yLine(x: number, z: number): number {
    return ((x << XZ_BITS) | z) * (1 << Y_BITS)
  }

  /** Packed base of the Z-line through (y, x); add z. */
  static zLine(y: number, x: number): number {
    return ((y << XZ_BITS) | x) * (1 << XZ_BITS)
  }

  /**
   * Coordinates strictly between `from` and `to` on the line with packed
   * base `base` (axis 0 = X, 1 = Y, 2 = Z), written to `out` in walking order
   * from `from` to `to`. Returns how many were written.
   */
  interior(axis: number, base: number, from: number, to: number, out: Int32Array): number {
    const arr = this.sorted[axis]
    const lo = base + Math.min(from, to)
    const hi = base + Math.max(from, to)
    // First index with value > lo
    let left = 0
    let right = arr.length
    while (left < right) {
      const mid = (left + right) >> 1
      if (arr[mid] <= lo) left = mid + 1
      else right = mid
    }
    let count = 0
    for (let i = left; i < arr.length && arr[i] < hi; i++) out[count++] = arr[i] - base
    if (from > to) {
      // Walking downward
      for (let i = 0, j = count - 1; i < j; i++, j--) {
        const tmp = out[i]
        out[i] = out[j]
        out[j] = tmp
      }
    }
    return count
  }
}

function triangulate(quads: IntBuffer): Triangulation {
  const d = quads.data
  const quadCount = quads.length / QUAD_STRIDE
  const corners = new Int32Array(12)

  // Every quad corner is a potential T-junction for the edges it lies on
  const lines = new LineIndex(quads)

  const positions = new IntBuffer(quadCount * 12 + 64)
  const colors = new IntBuffer(quadCount * 4 + 16)
  const indices = new IntBuffer(quadCount * 6 + 16)
  let insertedVertices = 0
  let centreFans = 0

  // Points inserted on the current edge; an edge can't hold more points than
  // there are half-block positions along it.
  const edgeScratch = new Int32Array(1 << Y_BITS)
  const edgeInsertCounts = [0, 0, 0, 0]

  for (let q = 0; q < quads.length; q += QUAD_STRIDE) {
    quadCorners(d, q, corners)
    const packedColor = (d[q + 7] << 24) | d[q + 6] // slot, rgb
    const base = positions.length / 3

    // Polygon: each corner followed by the points inserted on its outgoing edge
    for (let e = 0; e < 4; e++) {
      const i0 = e * 3
      const i1 = ((e + 1) % 4) * 3
      const x0 = corners[i0], y0 = corners[i0 + 1], z0 = corners[i0 + 2]
      const x1 = corners[i1], y1 = corners[i1 + 1], z1 = corners[i1 + 2]
      let count: number
      if (x0 !== x1) count = lines.interior(0, LineIndex.xLine(y0, z0), x0, x1, edgeScratch)
      else if (y0 !== y1) count = lines.interior(1, LineIndex.yLine(x0, z0), y0, y1, edgeScratch)
      else count = lines.interior(2, LineIndex.zLine(y0, x0), z0, z1, edgeScratch)
      edgeInsertCounts[e] = count
      insertedVertices += count

      positions.reserve(3 + count * 3)
      const pd = positions.data
      let w = positions.length
      pd[w++] = x0; pd[w++] = y0; pd[w++] = z0
      for (let i = 0; i < count; i++) {
        const value = edgeScratch[i]
        if (x0 !== x1) { pd[w++] = value; pd[w++] = y0; pd[w++] = z0 }
        else if (y0 !== y1) { pd[w++] = x0; pd[w++] = value; pd[w++] = z0 }
        else { pd[w++] = x0; pd[w++] = y0; pd[w++] = value }
      }
      positions.length = w
    }

    const polygonSize = positions.length / 3 - base
    if (polygonSize === 4) {
      pushTriangle(indices, base, base + 1, base + 2)
      pushTriangle(indices, base, base + 2, base + 3)
      pushColors(colors, packedColor, 4)
      continue
    }

    // Fan from a corner whose two edges gained no points: every fan triangle
    // then spans two distinct edge lines, so none is degenerate.
    let apex = -1
    for (let k = 0; k < 4; k++) {
      if (edgeInsertCounts[k] === 0 && edgeInsertCounts[(k + 3) % 4] === 0) {
        apex = k
        break
      }
    }
    if (apex >= 0) {
      // Polygon index of corner `apex`
      let apexIndex = 0
      for (let k = 0; k < apex; k++) apexIndex += 1 + edgeInsertCounts[k]
      for (let i = 1; i < polygonSize - 1; i++) {
        pushTriangle(
          indices,
          base + apexIndex,
          base + ((apexIndex + i) % polygonSize),
          base + ((apexIndex + i + 1) % polygonSize)
        )
      }
      pushColors(colors, packedColor, polygonSize)
      continue
    }

    // Every corner touches a split edge: fan around an added centre vertex
    // (integral: corners are whole blocks, i.e. even half-block units)
    positions.reserve(3)
    const centre = positions.length / 3
    positions.data[positions.length++] = (corners[0] + corners[6]) >> 1
    positions.data[positions.length++] = (corners[1] + corners[7]) >> 1
    positions.data[positions.length++] = (corners[2] + corners[8]) >> 1
    centreFans++
    for (let i = 0; i < polygonSize; i++) {
      pushTriangle(indices, centre, base + i, base + ((i + 1) % polygonSize))
    }
    pushColors(colors, packedColor, polygonSize + 1)
  }

  const vertexCount = positions.length / 3
  const positionArray = new Uint16Array(positions.length)
  positionArray.set(positions.data.subarray(0, positions.length))
  const colorArray = new Uint8Array(colors.length * 4)
  for (let i = 0; i < colors.length; i++) {
    const packed = colors.data[i]
    colorArray[i * 4] = (packed >>> 16) & 0xff
    colorArray[i * 4 + 1] = (packed >>> 8) & 0xff
    colorArray[i * 4 + 2] = packed & 0xff
    colorArray[i * 4 + 3] = (packed >>> 24) & 0xff
  }
  const indexArray = vertexCount > 0xffff ? new Uint32Array(indices.length) : new Uint16Array(indices.length)
  indexArray.set(indices.data.subarray(0, indices.length))

  return {
    positions: positionArray,
    colors: colorArray,
    indices: indexArray,
    vertexCount,
    insertedVertices,
    centreFans,
  }
}

function pushColors(colors: IntBuffer, packedColor: number, count: number): void {
  colors.reserve(count)
  for (let i = 0; i < count; i++) colors.data[colors.length++] = packedColor
}

function pushTriangle(indices: IntBuffer, a: number, b: number, c: number): void {
  indices.reserve(3)
  const d = indices.data
  d[indices.length++] = a
  d[indices.length++] = b
  d[indices.length++] = c
}
