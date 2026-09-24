import { CHUNK_SIZE_X } from '../interfaces/IChunk.ts'
import type { BiomeBlendData } from '../../workers/ChunkGenerationWorker.ts'

// ==================== Geometry constants ====================

/** Chunks per side of an LOD region (one mesh / draw call per region). */
export const LOD_REGION_CHUNKS = 8

/** Blocks per side of an LOD region. */
export const LOD_REGION_BLOCKS = LOD_REGION_CHUNKS * CHUNK_SIZE_X

/** Chunk slots per region (one bit each in the handoff mask). */
export const LOD_REGION_SLOTS = LOD_REGION_CHUNKS * LOD_REGION_CHUNKS

/**
 * Scale from stored vertex position units to blocks. Positions are Uint16 in
 * half-block units: the centre vertex that fans a 1-block-wide quad lands on
 * a half block.
 */
export const LOD_POSITION_SCALE = 0.5

/**
 * Blocks per heightfield cell side. 1 near the full-detail boundary (exact
 * heights at the handoff), coarser further out.
 */
export type LodCellSize = 1 | 2 | 4

/** Region-border sides, in `neighborMinFloor` order. */
export const LOD_SIDE_NORTH = 0 // z = -1 row, indexed by local chunk x
export const LOD_SIDE_SOUTH = 1 // z = LOD_REGION_CHUNKS row, indexed by local chunk x
export const LOD_SIDE_WEST = 2 // x = -1 column, indexed by local chunk z
export const LOD_SIDE_EAST = 3 // x = LOD_REGION_CHUNKS column, indexed by local chunk z

/** Length of `LodMeshRegionRequest.neighborMinFloor`. */
export const LOD_NEIGHBOR_COUNT = 4 * LOD_REGION_CHUNKS

/** The LOD ring reaches at least this many chunks beyond the full-detail render distance. */
export const LOD_MIN_MARGIN_CHUNKS = 2

// ==================== Tiles ====================

/** Tile flag: some columns had no surface block anywhere in the surface layer. */
export const LOD_TILE_INCOMPLETE = 1

/** Surface block kinds (the tile builder's per-block-id lookup). */
export const LOD_SURFACE_NONE = 0
/** Greedy-meshed cube: ends a column's surface search. */
export const LOD_SURFACE_SOLID = 1
/** Liquid: the column's top, but the floor search continues beneath it. */
export const LOD_SURFACE_LIQUID = 2

/**
 * Per-chunk surface summary the LOD mesher works from (~8 KB). Arrays are
 * indexed by column `z * 32 + x`.
 */
export interface LodTileSummary {
  readonly chunkX: number
  readonly chunkZ: number
  /**
   * Y + 1 of the top-most surface block (a greedy-meshed cube or a liquid -
   * flowers, ferns and torches don't count; leaves do). 0 = none found.
   */
  readonly top: Int16Array
  /** Block id of that surface block. */
  readonly topBlock: Uint16Array
  /** Block directly beneath it (0 for air or when outside the generated band). */
  readonly underBlock: Uint16Array
  /**
   * Y + 1 of the top-most solid surface block: the bed under a liquid top,
   * the top itself elsewhere. 0 = none found.
   */
  readonly floor: Int16Array
  /** Lowest / highest non-zero `top`. */
  readonly minTop: number
  readonly maxTop: number
  /**
   * Lowest Y + 1 of the top-most solid surface block (the bed under liquid
   * columns, the top elsewhere). Full detail shows lake beds through water,
   * so the surface band starts here. 0 = none found.
   */
  readonly minFloor: number
  /** LOD_TILE_* bits. */
  readonly flags: number
}

/**
 * Flat LOD colours per block id, as sRGB RGB triplets (index id * 3). Top is
 * the colour seen from above, side the colour of vertical faces.
 */
export interface LodPaletteData {
  readonly top: Uint8Array
  readonly side: Uint8Array
}

// ==================== Worker messages ====================

/** Palette for region meshing. Send once to every LOD worker before meshing. */
export interface LodInitRequest {
  readonly type: 'lod-init'
  readonly palette: LodPaletteData
}

/**
 * Generate one chunk's surface band with the real generation pipeline and
 * cache its summary in the worker. Route all tiles of a region to the same
 * worker - region meshing only sees that worker's tiles.
 */
export interface LodTileRequest {
  readonly type: 'lod-tile'
  readonly chunkX: number
  readonly chunkZ: number
  readonly seed: number
  readonly seaLevel: number
  readonly terrainThickness: number
  /** Surface-layer blend data (WorldGenerator.getBlendDataForChunk(x, z, 1)). */
  readonly biomeData: BiomeBlendData
}

export interface LodTileResult {
  readonly type: 'lod-tile-result'
  readonly chunkX: number
  readonly chunkZ: number
  readonly minTop: number
  readonly maxTop: number
  /** See LodTileSummary.minFloor. */
  readonly minFloor: number
  readonly flags: number
  /** Sub-chunks the band needed (cost diagnostics). */
  readonly subChunksGenerated: number
  readonly elapsedMs: number
}

/** Mesh one region from the tiles cached in this worker. */
export interface LodMeshRegionRequest {
  readonly type: 'lod-mesh-region'
  readonly requestId: number
  readonly regionX: number
  readonly regionZ: number
  /** Cell size for the whole region (the finest chunk size when chunkCellSizes is given). */
  readonly cellSize: LodCellSize
  /**
   * Cell size per chunk slot (lodChunkSlot order: 1, 2 or 4). When given it
   * overrides cellSize: chunks near the full-detail disk stay exact while the
   * rest of the region is coarser (see LodMesher).
   */
  readonly chunkCellSizes?: Uint8Array
  /**
   * Lowest surface - top or lake bed, min(minTop, minFloor) - of the chunks
   * bordering the region (LOD_SIDE_* × 8, see lodNeighborIndex); 0 =
   * unknown. Sizes the region-border skirts.
   */
  readonly neighborMinFloor: Int16Array
}

export interface LodMeshRegionResult {
  readonly type: 'lod-mesh-result'
  readonly requestId: number
  readonly regionX: number
  readonly regionZ: number
  readonly cellSize: LodCellSize
  /** xyz per vertex in half-block units (LOD_POSITION_SCALE), region-local x/z. */
  readonly positions: Uint16Array
  /** Per vertex: sRGB r, g, b and the chunk slot (lodChunkSlot) in the 4th byte. */
  readonly colors: Uint8Array
  readonly indices: Uint16Array | Uint32Array
  /** Bit per chunk slot that has geometry: slots 0-31 / 32-63. */
  readonly chunkMaskLo: number
  readonly chunkMaskHi: number
  /** World Y range covered by the vertices, in blocks (bounds; 0/0 when empty). */
  readonly minY: number
  readonly maxY: number
  /** Tiles that contributed. */
  readonly tileCount: number
  readonly elapsedMs: number
}

/**
 * Drop cached tiles that left the LOD ring: whole regions (flat [regionX,
 * regionZ, ...]) and/or single chunks (flat [chunkX, chunkZ, ...]).
 */
export interface LodEvictRequest {
  readonly type: 'lod-evict'
  readonly regions: Int32Array
  readonly chunks?: Int32Array
}

export interface LodErrorResult {
  readonly type: 'lod-error'
  readonly request: 'lod-tile' | 'lod-mesh-region'
  /** Chunk (tile) or region (mesh) coordinates of the failed request. */
  readonly x: number
  readonly z: number
  readonly requestId?: number
  readonly error: string
}

export type LodWorkerRequest = LodInitRequest | LodTileRequest | LodMeshRegionRequest | LodEvictRequest
export type LodWorkerResponse = LodTileResult | LodMeshRegionResult | LodErrorResult

// ==================== Helpers ====================

/** Region coordinate of a chunk coordinate. */
export function lodRegionCoord(chunk: number): number {
  return Math.floor(chunk / LOD_REGION_CHUNKS)
}

/** Chunk slot (0-63) within its region: local z * 8 + local x. */
export function lodChunkSlot(chunkX: number, chunkZ: number): number {
  return ((chunkZ & (LOD_REGION_CHUNKS - 1)) * LOD_REGION_CHUNKS) + (chunkX & (LOD_REGION_CHUNKS - 1))
}

/** Index into `neighborMinFloor` for a side and the local chunk index along it. */
export function lodNeighborIndex(side: number, along: number): number {
  return side * LOD_REGION_CHUNKS + along
}

/** Cache key of a tile. */
export function lodTileKey(chunkX: number, chunkZ: number): string {
  return chunkX + ',' + chunkZ
}

/** Offset making packed coordinates non-negative (supports |coord| < 2^23). */
const PACK_OFFSET = 1 << 23
const PACK_SCALE = 1 << 24

/**
 * Allocation-free numeric key of a chunk or region coordinate pair (exact for
 * |x|, |z| < 2^23, far beyond any reachable chunk).
 */
export function lodPackKey(x: number, z: number): number {
  return (x + PACK_OFFSET) * PACK_SCALE + (z + PACK_OFFSET)
}
