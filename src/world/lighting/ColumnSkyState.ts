import type { ChunkColumn } from '../chunks/ChunkColumn.ts'
import { CHUNK_HEIGHT, SUB_CHUNK_COUNT, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import {
  SKY_SEED_DARK,
  SKY_SEED_OPEN,
  SKY_SEED_OPEN_IF_PROVEN,
  SKY_SEED_SIZE,
} from './SubChunkLight.ts'

/**
 * Sky "proof" for a chunk column (the data lives on ChunkColumn: skyFloor and
 * skyProofSubY). A cell receives direct skylight only if every cell above it
 * up to the world top is sky-clear (opacity 0) AND known:
 *
 * - light-ready sub-chunks: their actual blocks;
 * - sub-chunks above the column's proof sub-chunk (a loaded sub-chunk with
 *   skyOpenAbove, see provesSkyAbove in SubChunkLight.ts) that are not loaded
 *   yet: clear, except for any blocks already written into a placeholder there
 *   (decorations, player builds above the loaded band);
 * - anything else is unknown and blocks the sky.
 *
 * Unknown = dark, so loading data normally only adds light. (The proof can be
 * wrong only for structures overhanging from a neighbouring column above the
 * proof sub-chunk; the engine darkens those columns when that data loads.)
 */

// Sub-chunk sky states for floor scans.
/** Scan the sub-chunk's blocks (light-ready, or a placeholder in a proven region). */
const SUB_SKY_KNOWN = 0
/** Proven clear and nothing written there. */
const SUB_SKY_CLEAR = 1
/** Unknown: blocks the sky. */
const SUB_SKY_UNKNOWN = 2

function subSkyState(column: ChunkColumn, subY: number, optimistic: boolean): number {
  const sub = column.getSubChunk(subY)
  if (sub !== null && sub.lightReady) return SUB_SKY_KNOWN
  if (optimistic || subY > column.skyProofSubY) return sub === null ? SUB_SKY_CLEAR : SUB_SKY_KNOWN
  return SUB_SKY_UNKNOWN
}

/**
 * Scan down from `fromY` (inclusive) assuming every cell above it is direct,
 * and return the new floor: the lowest Y whose run up to fromY is sky-clear.
 * Returns fromY + 1 when fromY itself blocks.
 * @param optimistic treat unknown sub-chunks as proven clear (see computeSkySeed)
 */
export function scanSkyFloor(
  column: ChunkColumn,
  lx: number,
  lz: number,
  fromY: number,
  opacity: Uint8Array,
  optimistic = false
): number {
  const k = (lz << 5) | lx
  let y = fromY
  while (y >= 0) {
    const subY = y >> 5
    const state = subSkyState(column, subY, optimistic)
    if (state === SUB_SKY_UNKNOWN) return y + 1
    if (state === SUB_SKY_CLEAR) {
      y = subY * SUB_CHUNK_HEIGHT - 1
      continue
    }
    const blocks = column.getSubChunk(subY)!.getBlockData()
    const bottom = subY * SUB_CHUNK_HEIGHT
    for (let i = ((y & 31) << 10) | k; y >= bottom; y--, i -= 1024) {
      if (opacity[blocks[i]] !== 0) return y + 1
    }
  }
  return 0
}

/**
 * Full floor for one (x, z) of a column, scanned from the world top.
 */
export function computeSkyFloor(column: ChunkColumn, lx: number, lz: number, opacity: Uint8Array): number {
  return scanSkyFloor(column, lx, lz, CHUNK_HEIGHT - 1, opacity)
}

/**
 * Per-column sky seed for generating sub-chunk `subY` of `column` (32x32,
 * index z*32+x): SKY_SEED_OPEN where direct sky already reaches the top of the
 * sub-chunk, SKY_SEED_OPEN_IF_PROVEN where everything known above is clear but
 * unloaded sub-chunks are in the way (the new sub-chunk's own sky proof would
 * clear them), SKY_SEED_DARK otherwise.
 */
export function computeSkySeed(
  column: ChunkColumn | undefined,
  subY: number,
  opacity: Uint8Array,
  out: Uint8Array
): Uint8Array {
  if (subY >= SUB_CHUNK_COUNT - 1) return out.fill(SKY_SEED_OPEN)
  if (!column) return out.fill(SKY_SEED_OPEN_IF_PROVEN)

  const top = (subY + 1) * SUB_CHUNK_HEIGHT
  const floors = column.skyFloor
  for (let k = 0; k < SKY_SEED_SIZE; k++) {
    if (floors[k] <= top) {
      out[k] = SKY_SEED_OPEN
    } else {
      // Everything above the stored floor is already clear; continue from there.
      const optimisticFloor = scanSkyFloor(column, k & 31, k >> 5, floors[k] - 1, opacity, true)
      out[k] = optimisticFloor <= top ? SKY_SEED_OPEN_IF_PROVEN : SKY_SEED_DARK
    }
  }
  return out
}
