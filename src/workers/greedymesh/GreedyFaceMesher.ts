import { AO_BRIGHTNESS, LIGHT_FLOOR, lightShape } from '../../renderer/lightCurve.ts'
import { CHUNK_LIGHT_SCALE } from '../../renderer/ChunkVertexFormat.ts'
import type { ChunkGeometryWriter } from './ChunkGeometryWriter.ts'
import { MESH_SUB_CHUNK_SIZE } from '../../world/meshing/MeshNeighborShell.ts'
import {
  PAD_ORIGIN, PAD_STRIDE_X, PAD_STRIDE_Y, PAD_STRIDE_Z, MISSING_BLOCK,
  type PaddedVolume,
} from './PaddedVolume.ts'

/**
 * Greedy face meshing with smooth lighting and ambient occlusion.
 *
 * For every visible face the 8 cells around its face cell (the air cell the
 * face looks into) give Minecraft-style per-corner values: AO from the two
 * edge neighbours and the corner neighbour, and sky/block light averaged over
 * the non-opaque cells among face cell + those three.
 *
 * Faces merge greedily (texture coordinates in block units, repeated by the
 * sampler) only when the merged quad interpolates exactly like the individual
 * faces would:
 * - uniform faces (4 equal corners) merge with equal neighbours both ways;
 * - faces whose corners vary only across one axis (e.g. the AO band along a
 *   wall foot) merge with identical neighbours along the other axis — the
 *   shading is linear across the strip either way;
 * - anything else stays a 1×1 quad.
 */

const SIZE = MESH_SUB_CHUNK_SIZE
const AIR = 0

// Face indices (BlockFace order)
const FACE_TOP = 0
const FACE_BOTTOM = 1
const FACE_NORTH = 2
const FACE_SOUTH = 3
const FACE_EAST = 4
const FACE_WEST = 5

const AXIS_X = 0
const AXIS_Y = 1
const AXIS_Z = 2
const AXIS_STRIDE = [PAD_STRIDE_X, PAD_STRIDE_Y, PAD_STRIDE_Z]

interface FaceAxes {
  readonly face: number
  /** Axis of the face normal and its sign. */
  readonly normalAxis: number
  readonly normalSign: number
  /** In-plane axes: mask u / v and texture u / v run along these. */
  readonly uAxis: number
  readonly vAxis: number
  /** Texture orientation (see FACES: sides upright, top up = +Z, bottom up = −Z). */
  readonly flipU: boolean
  readonly flipV: boolean
  /** Padded-index deltas. */
  readonly nDelta: number
  readonly uDelta: number
  readonly vDelta: number
  /** 1 for faces on the far side of their cell (+X/+Y/+Z). */
  readonly planeOffset: number
  /** True when (u × v) points against the normal (winding must be reversed). */
  readonly reversed: boolean
}

function makeFace(face: number, normalAxis: number, normalSign: number, uAxis: number, vAxis: number, flipU: boolean, flipV: boolean): FaceAxes {
  const unit = (axis: number): [number, number, number] => [axis === AXIS_X ? 1 : 0, axis === AXIS_Y ? 1 : 0, axis === AXIS_Z ? 1 : 0]
  const u = unit(uAxis)
  const v = unit(vAxis)
  const n = unit(normalAxis)
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const facing = (cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]) * normalSign
  return {
    face, normalAxis, normalSign, uAxis, vAxis, flipU, flipV,
    nDelta: AXIS_STRIDE[normalAxis] * normalSign,
    uDelta: AXIS_STRIDE[uAxis],
    vDelta: AXIS_STRIDE[vAxis],
    planeOffset: normalSign > 0 ? 1 : 0,
    reversed: facing < 0,
  }
}

// Texture orientation per face: side faces upright and read un-mirrored from
// outside (texture u runs to the viewer's right, like three's BoxGeometry used
// by item displays), top faces with the texture's up toward +Z, bottom toward
// −Z. Faces in QUARTER_TURN_FACES are turned a further quarter (emitQuad).
const FACES: readonly FaceAxes[] = [
  makeFace(FACE_TOP, AXIS_Y, 1, AXIS_X, AXIS_Z, false, false),
  makeFace(FACE_BOTTOM, AXIS_Y, -1, AXIS_X, AXIS_Z, false, true),
  makeFace(FACE_NORTH, AXIS_Z, -1, AXIS_X, AXIS_Y, true, false),
  makeFace(FACE_SOUTH, AXIS_Z, 1, AXIS_X, AXIS_Y, false, false),
  makeFace(FACE_EAST, AXIS_X, 1, AXIS_Z, AXIS_Y, true, false),
  makeFace(FACE_WEST, AXIS_X, -1, AXIS_Z, AXIS_Y, false, false),
]

// Corner order of every quad in (du, dv): (0,0) (1,0) (1,1) (0,1)
const CORNER_DU = [0, 1, 1, 0]
const CORNER_DV = [0, 0, 1, 1]

/** AO brightness per level as the vertex byte (×255). */
const AO_BYTE = AO_BRIGHTNESS.map((b) => Math.round(b * 255))

/**
 * Approximate brightness per stored light value (level × 16), used only to pick
 * the quad diagonal. Includes the floor so AO still orders corners in darkness.
 */
const LIGHT_Q_BRIGHTNESS = new Float32Array(15 * CHUNK_LIGHT_SCALE + 1)
for (let q = 0; q < LIGHT_Q_BRIGHTNESS.length; q++) {
  LIGHT_Q_BRIGHTNESS[q] = LIGHT_FLOOR + lightShape(q / CHUNK_LIGHT_SCALE)
}

// Packed corner: ao (2 bits) | sky×16 (8 bits) << 2 | block×16 (8 bits) << 10
const CORNER_SKY_SHIFT = 2
const CORNER_BLOCK_SHIFT = 10
const CORNER_VALUES = 1 << 18

// Merge classes: which mask axes a face may grow along
const MERGE_NONE = 0
const MERGE_U = 1
const MERGE_V = 2
const MERGE_BOTH = MERGE_U | MERGE_V

/** Per-block lookup tables supplied by the worker (indexed by block id). */
export interface MesherTables {
  /** 1 = opaque (hides neighbour faces, occludes AO). MISSING_BLOCK must be 0. */
  readonly opaque: Uint8Array
  /** 1 = rendered by the non-greedy (instanced) path, skipped here. */
  readonly nonGreedy: Uint8Array
  /** Texture-array layer per blockId * 6 + face. */
  readonly faceLayer: Uint8Array
  /** 1 = the face's texture is turned a quarter (QUARTER_TURN_FACES), per blockId * 6 + face. */
  readonly quarterTurn: Uint8Array
}

// Per-slice scratch (reused). Mask keys are exact integers below 2^53:
// ((material * 4 + class) * 2^18 + cornerA) * 2^18 + cornerB, 0 = no face,
// negative = unique (never merges). material = layer, quarter turn and
// cutout flag (< 2^11).
const mask = new Float64Array(SIZE * SIZE)
const cellLayer = new Uint8Array(SIZE * SIZE)
const cellCutout = new Uint8Array(SIZE * SIZE)
const cellTurn = new Uint8Array(SIZE * SIZE)
const cellMerge = new Uint8Array(SIZE * SIZE)
const cellCorners = new Uint32Array(SIZE * SIZE * 4)

/**
 * Compute the 4 packed corners of the face whose face cell is at padded index
 * `f`, writing them to cellCorners[out .. out + 3] in CORNER order.
 */
function shadeFace(volume: PaddedVolume, opaque: Uint8Array, f: number, uDelta: number, vDelta: number, out: number): void {
  const blocks = volume.blocks
  const light = volume.light

  const faceLight = light[f]
  const faceSky = faceLight >> 4
  const faceBlock = faceLight & 15

  for (let c = 0; c < 4; c++) {
    const s1 = f + (CORNER_DU[c] === 1 ? uDelta : -uDelta)
    const s2 = f + (CORNER_DV[c] === 1 ? vDelta : -vDelta)
    const sc = s1 + (s2 - f)

    const b1 = blocks[s1]
    const b2 = blocks[s2]
    const bc = blocks[sc]
    const o1 = opaque[b1]
    const o2 = opaque[b2]
    const oc = opaque[bc]

    let ao: number
    let sky = faceSky
    let block = faceBlock
    let count = 1
    if (o1 === 1 && o2 === 1) {
      // Corner cell is unreachable through two solid edges: ignore it
      ao = 0
    } else {
      ao = 3 - (o1 + o2 + oc)
      if (oc === 0) {
        // Missing neighbour data: reuse the face's own light, never guess
        const l = bc === MISSING_BLOCK ? faceLight : light[sc]
        sky += l >> 4
        block += l & 15
        count++
      }
    }
    if (o1 === 0) {
      const l = b1 === MISSING_BLOCK ? faceLight : light[s1]
      sky += l >> 4
      block += l & 15
      count++
    }
    if (o2 === 0) {
      const l = b2 === MISSING_BLOCK ? faceLight : light[s2]
      sky += l >> 4
      block += l & 15
      count++
    }

    const skyQ = Math.round((sky * CHUNK_LIGHT_SCALE) / count)
    const blockQ = Math.round((block * CHUNK_LIGHT_SCALE) / count)
    cellCorners[out + c] = ao | (skyQ << CORNER_SKY_SHIFT) | (blockQ << CORNER_BLOCK_SHIFT)
  }
}

/**
 * Classify a shaded cell and write its merge key. Corners are in CORNER order:
 * c0 (0,0), c1 (1,0), c2 (1,1), c3 (0,1).
 */
function writeMergeKey(i: number, layer: number, cutout: number, turn: number): void {
  const o = i * 4
  const c0 = cellCorners[o]
  const c1 = cellCorners[o + 1]
  const c2 = cellCorners[o + 2]
  const c3 = cellCorners[o + 3]
  const constantAlongU = c0 === c1 && c3 === c2
  const constantAlongV = c0 === c3 && c1 === c2

  let merge: number
  let cornerB: number
  if (constantAlongU && constantAlongV) {
    merge = MERGE_BOTH
    cornerB = c0
  } else if (constantAlongU) {
    merge = MERGE_U
    cornerB = c3
  } else if (constantAlongV) {
    merge = MERGE_V
    cornerB = c1
  } else {
    cellMerge[i] = MERGE_NONE
    mask[i] = -1 - i
    return
  }
  cellMerge[i] = merge
  const material = ((layer + 1) * 2 + turn) * 2 + cutout
  mask[i] = ((material * 4 + merge) * CORNER_VALUES + c0) * CORNER_VALUES + cornerB
}

function cornerBrightness(corner: number): number {
  const sky = (corner >> CORNER_SKY_SHIFT) & 0xFF
  const block = (corner >> CORNER_BLOCK_SHIFT) & 0xFF
  return AO_BRIGHTNESS[corner & 3] * LIGHT_Q_BRIGHTNESS[sky > block ? sky : block]
}

const quadPosition = [0, 0, 0]

function emitQuad(
  writer: ChunkGeometryWriter,
  axes: FaceAxes,
  slice: number,
  u0: number,
  v0: number,
  width: number,
  height: number,
  layer: number,
  turn: number,
  cornerBase: number
): void {
  const base = writer.beginQuad()
  const plane = slice + axes.planeOffset
  const pos = quadPosition

  for (let c = 0; c < 4; c++) {
    const du = CORNER_DU[c]
    const dv = CORNER_DV[c]
    pos[axes.normalAxis] = plane
    pos[axes.uAxis] = u0 + du * width
    pos[axes.vAxis] = v0 + dv * height
    const baseU = (axes.flipU ? 1 - du : du) * width
    const baseV = (axes.flipV ? 1 - dv : dv) * height
    // Quarter turn (a rotation, not a mirror): the texture's v runs along u
    const texU = turn === 1 ? baseV : baseU
    const texV = turn === 1 ? width - baseU : baseV
    const corner = cellCorners[cornerBase + c]
    writer.pushVertex(
      pos[0], pos[1], pos[2],
      texU, texV, layer, axes.face,
      (corner >> CORNER_SKY_SHIFT) & 0xFF, (corner >> CORNER_BLOCK_SHIFT) & 0xFF, AO_BYTE[corner & 3],
      du | (dv << 1)
    )
  }

  // Split along the brighter diagonal so AO/light gradients don't depend on
  // the quad's orientation (the classic voxel-AO anisotropy fix).
  const diagonal02 =
    cornerBrightness(cellCorners[cornerBase]) + cornerBrightness(cellCorners[cornerBase + 2]) >=
    cornerBrightness(cellCorners[cornerBase + 1]) + cornerBrightness(cellCorners[cornerBase + 3])

  if (axes.reversed) {
    if (diagonal02) writer.pushQuadIndices(base, 0, 2, 1, 0, 3, 2)
    else writer.pushQuadIndices(base, 0, 3, 1, 1, 3, 2)
  } else {
    if (diagonal02) writer.pushQuadIndices(base, 0, 1, 2, 0, 2, 3)
    else writer.pushQuadIndices(base, 0, 1, 3, 1, 2, 3)
  }
}

/**
 * Mesh every greedy-meshable face of the padded sub-chunk into the opaque and
 * cutout writers (positions are sub-chunk local).
 */
export function meshGreedyFaces(
  volume: PaddedVolume,
  tables: MesherTables,
  opaqueWriter: ChunkGeometryWriter,
  cutoutWriter: ChunkGeometryWriter
): void {
  const { opaque, nonGreedy, faceLayer, quarterTurn } = tables
  const blocks = volume.blocks
  const faceLayerLength = faceLayer.length

  for (const axes of FACES) {
    const { nDelta, uDelta, vDelta, face } = axes
    const sliceDelta = AXIS_STRIDE[axes.normalAxis]

    for (let slice = 0; slice < SIZE; slice++) {
      // Build the face mask for this slice
      let faces = 0
      for (let v = 0; v < SIZE; v++) {
        let p = PAD_ORIGIN + slice * sliceDelta + v * vDelta
        let i = v * SIZE
        for (let u = 0; u < SIZE; u++, p += uDelta, i++) {
          const id = blocks[p]
          if (id === AIR || nonGreedy[id] === 1) {
            mask[i] = 0
            continue
          }
          const faceCell = p + nDelta
          const neighbor = blocks[faceCell]
          // Toward a missing neighbour sub-chunk: cull (appears when it loads)
          if (neighbor === MISSING_BLOCK || opaque[neighbor] === 1) {
            mask[i] = 0
            continue
          }

          const layerKey = id * 6 + face
          const layer = layerKey < faceLayerLength ? faceLayer[layerKey] : 0
          const turn = layerKey < quarterTurn.length ? quarterTurn[layerKey] : 0
          const cutout = opaque[id] === 1 ? 0 : 1
          shadeFace(volume, opaque, faceCell, uDelta, vDelta, i * 4)
          cellLayer[i] = layer
          cellCutout[i] = cutout
          cellTurn[i] = turn
          writeMergeKey(i, layer, cutout, turn)
          faces++
        }
      }
      if (faces === 0) continue

      // Greedy merge; emit each rectangle as one quad
      for (let v = 0; v < SIZE; v++) {
        for (let u = 0; u < SIZE; u++) {
          const i = v * SIZE + u
          const key = mask[i]
          if (key === 0) continue
          const merge = cellMerge[i]

          let width = 1
          if ((merge & MERGE_U) !== 0) {
            while (u + width < SIZE && mask[i + width] === key) width++
          }

          let height = 1
          if ((merge & MERGE_V) !== 0) {
            grow: while (v + height < SIZE) {
              const row = i + height * SIZE
              for (let k = 0; k < width; k++) {
                if (mask[row + k] !== key) break grow
              }
              height++
            }
          }

          for (let dv = 0; dv < height; dv++) {
            mask.fill(0, i + dv * SIZE, i + dv * SIZE + width)
          }

          const writer = cellCutout[i] === 1 ? cutoutWriter : opaqueWriter
          emitQuad(writer, axes, slice, u, v, width, height, cellLayer[i], cellTurn[i], i * 4)
        }
      }
    }
  }
}
