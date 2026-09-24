import { SUB_CHUNK_LAYER, SUB_CHUNK_TOP_ROW_START, SUB_CHUNK_VOLUME } from '../interfaces/IChunk.ts'
import { closedLightFaces, LIGHT_FACE_BOTTOM, LIGHT_FACE_TOP, OPACITY_OPAQUE, type LightTables } from './LightTables.ts'

/**
 * Local light for ONE isolated sub-chunk: direct skylight entering through the
 * top face where the seed says so, emitters, and a BFS confined to the
 * sub-chunk (neighbours are treated as dark). The LightEngine later merges
 * the result with loaded neighbours (increase-only border exchange), so this
 * must use exactly the engine's semantics (see LightTables.ts).
 *
 * Runs in the generation worker (after every block-writing phase) and on the
 * main thread for sub-chunks loaded without worker light (persistence).
 */

/** Per-column sky seed values sent with a generation request (32x32, index z*32+x). */
export const SKY_SEED_DARK = 0
/** Direct sky reaches the top of the sub-chunk. */
export const SKY_SEED_OPEN = 1
/**
 * Everything known above is clear, but some sub-chunk above is not loaded yet:
 * the sky is open only if the generated sub-chunk proves the sky above itself
 * (its skyOpenAbove flag then covers the unloaded sub-chunks above).
 */
export const SKY_SEED_OPEN_IF_PROVEN = 2

export const SKY_SEED_SIZE = SUB_CHUNK_LAYER

/**
 * Sky proof of a freshly generated/loaded sub-chunk: no terrain lies above it
 * (the generator's hasTerrainAbove is false) and nothing crosses its top face.
 * Anything generated in this chunk column that reaches higher - a tree, a
 * cone, a player build - has to cross that face, so the sub-chunks above are
 * empty (up to structures overhanging from neighbouring columns, which the
 * light engine corrects when that data loads).
 */
export function provesSkyAbove(blocks: Uint16Array, hasTerrainAbove: boolean): boolean {
  if (hasTerrainAbove) return false
  for (let i = SUB_CHUNK_TOP_ROW_START; i < SUB_CHUNK_VOLUME; i++) {
    if (blocks[i] !== 0) return false
  }
  return true
}

/**
 * Resolve a request seed (0/1/2 per column) into a plain open/dark mask
 * (0/1 per column) once the sub-chunk's own sky proof is known.
 */
export function resolveSkySeed(seed: Uint8Array | null, skyOpenAbove: boolean, out: Uint8Array): Uint8Array {
  for (let k = 0; k < SKY_SEED_SIZE; k++) {
    const v = seed ? seed[k] : SKY_SEED_OPEN_IF_PROVEN
    out[k] = v === SKY_SEED_OPEN || (v === SKY_SEED_OPEN_IF_PROVEN && skyOpenAbove) ? 1 : 0
  }
  return out
}

// Scratch state shared by all calls (single-threaded per realm). The BFS
// dedupes queued cells, so the ring never holds more than one sub-chunk.
const queue = new Int32Array(SUB_CHUNK_VOLUME)
const queued = new Uint8Array(SUB_CHUNK_VOLUME)
const QUEUE_MASK = SUB_CHUNK_VOLUME - 1
let qHead = 0
let qCount = 0

let curBlocks: Uint16Array = new Uint16Array(0)
let curLight: Uint8Array = new Uint8Array(0)
let curOpacity: Uint8Array = new Uint8Array(0)
let curVerticalStop: Uint8Array = new Uint8Array(0)
let curMeta: Uint8Array | null = null
let curTables: LightTables | null = null
let curCap = 0

/** Closed horizontal faces of cell i (see closedLightFaces). */
function facesAt(i: number): number {
  const id = curBlocks[i]
  if (curVerticalStop[id] === 0) return 0
  return closedLightFaces(curTables!, id, curMeta ? curMeta[i] : 0)
}

function enqueue(i: number): void {
  if (queued[i]) return
  queued[i] = 1
  queue[(qHead + qCount) & QUEUE_MASK] = i
  qCount++
}

/** Offer light (sky s, block b) from a neighbour into cell j. */
function relax(j: number, s: number, b: number): void {
  const op = curOpacity[curBlocks[j]]
  if (op >= OPACITY_OPAQUE) return
  const cost = op > 1 ? op : 1
  let cs = s - cost
  if (cs > curCap) cs = curCap
  const cb = b - cost
  const v = curLight[j]
  let ns = v >> 4
  let nb = v & 15
  let changed = false
  if (cs > ns) {
    ns = cs
    changed = true
  }
  if (cb > nb) {
    nb = cb
    changed = true
  }
  if (changed) {
    curLight[j] = (ns << 4) | nb
    enqueue(j)
  }
}

/**
 * Compute local light for an isolated sub-chunk into `light` (overwritten).
 * @param blocks  32x32x32 block ids (y-major: y*1024 + z*32 + x)
 * @param light   output, high nibble sky, low nibble block
 * @param skySeed resolved 0/1 mask (z*32+x): direct sky enters the top face; null = none
 * @param skyCap  the sub-chunk's biome skylight cap (0-15)
 * @param metadata block metadata (slab/stair orientation, see closedLightFaces); null = all 0
 */
export function computeSubChunkLight(
  blocks: Uint16Array,
  light: Uint8Array,
  skySeed: Uint8Array | null,
  skyCap: number,
  tables: LightTables,
  metadata: Uint8Array | null = null
): void {
  const { opacity, emission, verticalStop } = tables
  curBlocks = blocks
  curLight = light
  curOpacity = opacity
  curVerticalStop = verticalStop
  curMeta = metadata
  curTables = tables
  curCap = skyCap
  qHead = 0
  qCount = 0
  light.fill(0)

  // Direct sky: straight down from the top face through fully clear cells.
  if (skySeed && skyCap > 0) {
    const direct = skyCap << 4
    for (let k = 0; k < SKY_SEED_SIZE; k++) {
      if (!skySeed[k]) continue
      for (let i = SUB_CHUNK_TOP_ROW_START + k; i >= 0; i -= SUB_CHUNK_LAYER) {
        if (opacity[blocks[i]] !== 0) break
        light[i] = direct
      }
    }
  }

  // Emitters (including opaque ones, which radiate from their own cell).
  for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
    const em = emission[blocks[i]]
    if (em > 0) {
      light[i] |= em
      if (em > 1) enqueue(i)
    }
  }

  // Seed only the edge of the direct-sky region: direct cells next to a
  // transparent cell that is not itself direct. Interior direct cells can't
  // raise anything (their neighbours are already at the cap).
  if (skySeed && skyCap > 1) {
    const direct = skyCap
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      if (light[i] >> 4 !== direct) continue
      const x = i & 31
      const z = (i >> 5) & 31
      const y = i >> 10
      if (
        (x > 0 && light[i - 1] >> 4 !== direct && opacity[blocks[i - 1]] < OPACITY_OPAQUE) ||
        (x < 31 && light[i + 1] >> 4 !== direct && opacity[blocks[i + 1]] < OPACITY_OPAQUE) ||
        (z > 0 && light[i - 32] >> 4 !== direct && opacity[blocks[i - 32]] < OPACITY_OPAQUE) ||
        (z < 31 && light[i + 32] >> 4 !== direct && opacity[blocks[i + 32]] < OPACITY_OPAQUE) ||
        (y > 0 && light[i - 1024] >> 4 !== direct && opacity[blocks[i - 1024]] < OPACITY_OPAQUE) ||
        (y < 31 && light[i + 1024] >> 4 !== direct && opacity[blocks[i + 1024]] < OPACITY_OPAQUE)
      ) {
        enqueue(i)
      }
    }
  }

  // FIFO relaxation; a cell improved while queued is processed once with its
  // latest value.
  while (qCount > 0) {
    const i = queue[qHead]
    qHead = (qHead + 1) & QUEUE_MASK
    qCount--
    queued[i] = 0
    const v = light[i]
    const s = v >> 4
    const b = v & 15
    if (s <= 1 && b <= 1) continue
    const x = i & 31
    const z = (i >> 5) & 31
    const y = i >> 10
    if (x > 0) relax(i - 1, s, b)
    if (x < 31) relax(i + 1, s, b)
    if (z > 0) relax(i - 32, s, b)
    if (z < 31) relax(i + 32, s, b)
    // (never across a slab or stair's full top/bottom face)
    const faces = facesAt(i)
    if (y > 0 && ((faces & LIGHT_FACE_BOTTOM) | (facesAt(i - 1024) & LIGHT_FACE_TOP)) === 0) relax(i - 1024, s, b)
    if (y < 31 && ((faces & LIGHT_FACE_TOP) | (facesAt(i + 1024) & LIGHT_FACE_BOTTOM)) === 0) relax(i + 1024, s, b)
  }
}
