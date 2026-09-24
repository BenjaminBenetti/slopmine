import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import { LAYER_BOUNDARY_SUB_CHUNK } from '../generate/GenerationConfig.ts'
import {
  LOD_SURFACE_NONE,
  LOD_SURFACE_SOLID,
  LOD_TILE_INCOMPLETE,
  type LodTileSummary,
} from './LodTypes.ts'

const COLUMNS = CHUNK_SIZE_X * CHUNK_SIZE_Z
const TOP_LAYER_START = (SUB_CHUNK_HEIGHT - 1) * COLUMNS

/**
 * Generates one sub-chunk of the tile's column and returns its block ids
 * (y-major, `y * 1024 + z * 32 + x`). Every array returned during one build
 * must stay valid until buildLodTile resolves.
 */
export type LodBandGenerator = (subY: number) => Promise<Uint16Array>

export interface LodTileBuild {
  readonly summary: LodTileSummary
  /** Sub-chunks generated for the band. */
  readonly subChunksGenerated: number
}

/**
 * Build a chunk's LOD surface summary from the real generation pipeline,
 * generating only the sub-chunks that hold its surface:
 *
 * 1. Start at the sub-chunk containing the highest blended terrain height.
 * 2. Walk up until a sub-chunk comes back entirely empty. A structure (tree,
 *    volcano cone, cliff, lake surface) can continue upward, and canopies
 *    rooted in a neighbouring chunk can overhang this one above an empty top
 *    layer, so any block at all keeps the walk going.
 * 3. Scan top-down for each column's top-most surface block - and, under a
 *    liquid top, the solid floor beneath it - generating lower sub-chunks
 *    only while some column hasn't resolved.
 *
 * Generation order doesn't matter: each sub-chunk is generated independently
 * by the worker, exactly as for full detail.
 *
 * @param terrainMaxY Highest blended terrain height over the chunk's columns.
 * @param surfaceKind Lookup by block id: LOD_SURFACE_SOLID for greedy-meshed
 *   cubes, LOD_SURFACE_LIQUID for liquids, LOD_SURFACE_NONE otherwise.
 */
export async function buildLodTile(
  chunkX: number,
  chunkZ: number,
  terrainMaxY: number,
  generate: LodBandGenerator,
  surfaceKind: Uint8Array
): Promise<LodTileBuild> {
  const lowest = LAYER_BOUNDARY_SUB_CHUNK
  const highest = SUB_CHUNK_COUNT - 1
  const start = Math.max(lowest, Math.min(highest, Math.floor(terrainMaxY / SUB_CHUNK_HEIGHT)))

  // Walk up from the terrain top until nothing is left above
  const band: Uint16Array[] = [] // band[i] = sub-chunk start + i
  let subY = start
  for (;;) {
    const blocks = await generate(subY)
    band.push(blocks)
    if (subY >= highest || !hasAnyBlock(blocks)) break
    subY++
  }

  const columns: ColumnScan = {
    top: new Int16Array(COLUMNS),
    topBlock: new Uint16Array(COLUMNS),
    underBlock: new Uint16Array(COLUMNS),
    floor: new Int16Array(COLUMNS),
    pendingUnder: [],
  }
  let unresolved = COLUMNS
  let generated = band.length

  // Scan the band top-down, then keep generating downward while needed
  for (let sub = start + band.length - 1; sub >= lowest; sub--) {
    let blocks: Uint16Array
    if (sub >= start) {
      blocks = band[sub - start]
    } else {
      if (unresolved === 0) break
      blocks = await generate(sub)
      generated++
    }

    for (const column of columns.pendingUnder) {
      columns.underBlock[column] = blocks[TOP_LAYER_START + column]
    }
    columns.pendingUnder.length = 0

    if (unresolved > 0) {
      unresolved -= scanSurface(blocks, sub, surfaceKind, columns)
    }
  }

  const { top, topBlock, underBlock, floor } = columns
  let minTop = Infinity
  let maxTop = 0
  let minFloor = Infinity
  for (let i = 0; i < COLUMNS; i++) {
    const value = top[i]
    if (value === 0) continue
    if (value < minTop) minTop = value
    if (value > maxTop) maxTop = value
    if (floor[i] !== 0 && floor[i] < minFloor) minFloor = floor[i]
  }

  return {
    summary: {
      chunkX,
      chunkZ,
      top,
      topBlock,
      underBlock,
      floor,
      minTop: maxTop === 0 ? 0 : minTop,
      maxTop,
      minFloor: minFloor === Infinity ? 0 : minFloor,
      flags: unresolved > 0 ? LOD_TILE_INCOMPLETE : 0,
    },
    subChunksGenerated: generated,
  }
}

/** Per-column scan state, indexed by column `z * 32 + x`. */
interface ColumnScan {
  /** Y + 1 of the top-most surface block; 0 = not found yet. */
  readonly top: Int16Array
  readonly topBlock: Uint16Array
  readonly underBlock: Uint16Array
  /** Y + 1 of the top-most solid surface block; 0 = not found yet. */
  readonly floor: Int16Array
  /**
   * Columns whose top sits on y=0 of a sub-chunk: the block beneath lives in
   * the next lower sub-chunk, filled in if that one gets generated.
   */
  readonly pendingUnder: number[]
}

/** True if the sub-chunk holds any non-air block. */
function hasAnyBlock(blocks: Uint16Array): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] !== 0) return true
  }
  return false
}

/**
 * Advance every unresolved column through this sub-chunk: find its top
 * surface block if still missing, then (below a liquid top) its floor. A
 * column resolves once its floor is known - for a solid top that is the top
 * itself. Returns how many columns resolved.
 */
function scanSurface(blocks: Uint16Array, subY: number, surfaceKind: Uint8Array, scan: ColumnScan): number {
  const { top, topBlock, underBlock, floor, pendingUnder } = scan
  const baseY = subY * SUB_CHUNK_HEIGHT
  let resolved = 0
  for (let column = 0; column < COLUMNS; column++) {
    if (floor[column] !== 0) continue
    let y = SUB_CHUNK_HEIGHT - 1

    if (top[column] === 0) {
      for (; y >= 0; y--) {
        const kind = surfaceKind[blocks[y * COLUMNS + column]]
        if (kind === LOD_SURFACE_NONE) continue
        top[column] = baseY + y + 1
        topBlock[column] = blocks[y * COLUMNS + column]
        if (y > 0) {
          underBlock[column] = blocks[(y - 1) * COLUMNS + column]
        } else {
          pendingUnder.push(column)
        }
        if (kind === LOD_SURFACE_SOLID) {
          floor[column] = top[column]
          resolved++
        }
        y--
        break
      }
      if (top[column] === 0 || floor[column] !== 0) continue
    }

    // Liquid top: the floor is the first solid surface block beneath it
    for (; y >= 0; y--) {
      if (surfaceKind[blocks[y * COLUMNS + column]] === LOD_SURFACE_SOLID) {
        floor[column] = baseY + y + 1
        resolved++
        break
      }
    }
  }
  return resolved
}
