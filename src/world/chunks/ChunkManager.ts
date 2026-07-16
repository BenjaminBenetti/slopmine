import type { IChunkCoordinate, ChunkKey, ISubChunkCoordinate, SubChunkKey } from '../interfaces/ICoordinates.ts'
import { createChunkKey, createSubChunkKey } from '../interfaces/ICoordinates.ts'
import { SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import { ChunkColumn } from './ChunkColumn.ts'
import { SubChunk } from './SubChunk.ts'
import { Chunk } from './Chunk.ts'
import { ChunkState } from '../interfaces/IChunk.ts'

/**
 * Manages chunk lifecycle: loading, unloading, caching.
 * Supports both legacy Chunk (full column) and new SubChunk/ChunkColumn storage.
 */
export class ChunkManager {
  // Legacy chunk storage (for backward compatibility during migration)
  private readonly chunks: Map<ChunkKey, Chunk> = new Map()
  private readonly accessOrder: Map<ChunkKey, true> = new Map()

  // New two-level storage
  private readonly columns: Map<ChunkKey, ChunkColumn> = new Map()
  private readonly subChunks: Map<SubChunkKey, SubChunk> = new Map()

  // Numeric-keyed column index maintained alongside `columns` for the
  // allocation-free fast path (getColumnFast). Chunk coords fit in doubles for
  // any reachable world, so a single packed Number key avoids BigInt->string
  // key building on the hot physics/raycast path.
  private readonly columnsByNumKey: Map<number, ChunkColumn> = new Map()

  // Last-hit column cache. Collision sweeps and raycasts hammer the same 1-4
  // columns, so a single-entry cache serves the overwhelming majority of
  // fast-path queries without touching the map at all. NaN never matches a
  // real packed key, so the first query always misses.
  private lastColumnKey = NaN
  private lastColumn: ChunkColumn | undefined = undefined

  // Packed-key bias: shifts chunk coords into a non-negative range before
  // packing two axes into one Number. BIAS=2^25 supports +-33M chunks
  // (~1 billion blocks) per axis; the product stays under 2^52 (safe integer).
  private static readonly NUM_KEY_BIAS = 0x2000000
  private static readonly NUM_KEY_STRIDE = 0x4000000 // 2^26

  private static numKey(cx: number, cz: number): number {
    return (cx + ChunkManager.NUM_KEY_BIAS) * ChunkManager.NUM_KEY_STRIDE +
           (cz + ChunkManager.NUM_KEY_BIAS)
  }

  // ==================== Legacy Chunk API (for migration) ====================

  /**
   * Get a chunk, returning undefined if not loaded.
   * @deprecated Use getColumn/getSubChunk instead
   */
  getChunk(coordinate: IChunkCoordinate): Chunk | undefined {
    const key = createChunkKey(coordinate.x, coordinate.z)
    const chunk = this.chunks.get(key)

    if (chunk) {
      this.touchChunk(key)
    }

    return chunk
  }

  /**
   * Check if a chunk is loaded.
   * @deprecated Use hasColumn instead
   */
  hasChunk(coordinate: IChunkCoordinate): boolean {
    const key = createChunkKey(coordinate.x, coordinate.z)
    return this.chunks.has(key)
  }

  /**
   * Load or create a chunk at the given coordinates.
   * @deprecated Use loadColumn/getOrCreateSubChunk instead
   */
  loadChunk(coordinate: IChunkCoordinate): Chunk {
    const key = createChunkKey(coordinate.x, coordinate.z)

    let chunk = this.chunks.get(key)
    if (chunk) {
      this.touchChunk(key)
      return chunk
    }

    chunk = new Chunk(coordinate)
    chunk.setState(ChunkState.LOADING)

    this.chunks.set(key, chunk)
    this.accessOrder.set(key, true)

    return chunk
  }

  /**
   * Unload a specific chunk.
   * @deprecated Use unloadColumn instead
   */
  unloadChunk(coordinate: IChunkCoordinate): void {
    const key = createChunkKey(coordinate.x, coordinate.z)
    const chunk = this.chunks.get(key)

    if (chunk) {
      chunk.dispose()
      this.chunks.delete(key)

      this.accessOrder.delete(key)
    }
  }


  /**
   * Get chunks within a radius of a center point.
   * @deprecated Use getColumnsInRadius instead
   */
  getChunksInRadius(center: IChunkCoordinate, radius: number): Chunk[] {
    const chunks: Chunk[] = []
    const radiusBig = BigInt(radius)

    for (let dx = -radiusBig; dx <= radiusBig; dx++) {
      for (let dz = -radiusBig; dz <= radiusBig; dz++) {
        const coord: IChunkCoordinate = {
          x: center.x + dx,
          z: center.z + dz,
        }

        const chunk = this.getChunk(coord)
        if (chunk) {
          chunks.push(chunk)
        }
      }
    }

    return chunks
  }

  // ==================== New Column/SubChunk API ====================

  /**
   * Get a chunk column.
   */
  getColumn(coordinate: IChunkCoordinate): ChunkColumn | undefined {
    const key = createChunkKey(coordinate.x, coordinate.z)
    return this.columns.get(key)
  }

  /**
   * Get a chunk column by numeric chunk coordinates (allocation-free fast path).
   * Uses a single-entry last-hit cache backed by a numeric-keyed map, so hot
   * callers (physics, raycast, entity light) never build BigInt/string keys.
   * Returns undefined if the column is not loaded (result is also cached).
   */
  getColumnFast(cx: number, cz: number): ChunkColumn | undefined {
    const key = ChunkManager.numKey(cx, cz)
    if (key === this.lastColumnKey) {
      return this.lastColumn
    }
    const column = this.columnsByNumKey.get(key)
    this.lastColumnKey = key
    this.lastColumn = column
    return column
  }

  /**
   * Check if a column exists.
   */
  hasColumn(coordinate: IChunkCoordinate): boolean {
    const key = createChunkKey(coordinate.x, coordinate.z)
    return this.columns.has(key)
  }

  /**
   * Get or create a chunk column.
   */
  loadColumn(coordinate: IChunkCoordinate): ChunkColumn {
    const key = createChunkKey(coordinate.x, coordinate.z)

    let column = this.columns.get(key)
    if (!column) {
      column = new ChunkColumn(coordinate)
      this.columns.set(key, column)
      this.columnsByNumKey.set(
        ChunkManager.numKey(Number(coordinate.x), Number(coordinate.z)),
        column
      )
      // A new column appeared; invalidate the last-hit cache in case it had
      // cached a miss for this coordinate.
      this.lastColumnKey = NaN
      this.lastColumn = undefined
    }

    return column
  }

  /**
   * Unload a chunk column and all its sub-chunks.
   */
  unloadColumn(coordinate: IChunkCoordinate): void {
    const key = createChunkKey(coordinate.x, coordinate.z)
    const column = this.columns.get(key)

    if (column) {
      // Remove all sub-chunks from direct access map
      for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
        const subKey = createSubChunkKey(coordinate.x, coordinate.z, subY)
        this.subChunks.delete(subKey)
      }

      column.dispose()
      this.columns.delete(key)
      this.columnsByNumKey.delete(
        ChunkManager.numKey(Number(coordinate.x), Number(coordinate.z))
      )
      // Drop the last-hit cache so a stale unloaded column is never returned.
      this.lastColumnKey = NaN
      this.lastColumn = undefined
    }
  }

  /**
   * Get a sub-chunk directly.
   */
  getSubChunk(coordinate: ISubChunkCoordinate): SubChunk | undefined {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    return this.subChunks.get(key)
  }

  /**
   * Check if a sub-chunk exists.
   */
  hasSubChunk(coordinate: ISubChunkCoordinate): boolean {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    return this.subChunks.has(key)
  }

  /**
   * Register a sub-chunk for direct access.
   * Called when a sub-chunk is created or loaded.
   */
  registerSubChunk(subChunk: SubChunk): void {
    const coord = subChunk.coordinate
    const key = createSubChunkKey(coord.x, coord.z, coord.subY)
    this.subChunks.set(key, subChunk)
  }

  /**
   * Unregister a sub-chunk from direct access.
   */
  unregisterSubChunk(coordinate: ISubChunkCoordinate): void {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    this.subChunks.delete(key)
  }

  /**
   * Get all loaded columns.
   */
  getLoadedColumns(): ChunkColumn[] {
    return Array.from(this.columns.values())
  }

  /**
   * Get all loaded sub-chunks.
   */
  getLoadedSubChunks(): SubChunk[] {
    return Array.from(this.subChunks.values())
  }

  /**
   * Get all dirty sub-chunks that need remeshing.
   */
  getDirtySubChunks(): SubChunk[] {
    return this.getLoadedSubChunks().filter(sc => sc.isDirty())
  }

  /**
   * Get columns within a radius of a center point.
   */
  getColumnsInRadius(center: IChunkCoordinate, radius: number): ChunkColumn[] {
    const columns: ChunkColumn[] = []
    const radiusBig = BigInt(radius)

    for (let dx = -radiusBig; dx <= radiusBig; dx++) {
      for (let dz = -radiusBig; dz <= radiusBig; dz++) {
        const coord: IChunkCoordinate = {
          x: center.x + dx,
          z: center.z + dz,
        }

        const column = this.getColumn(coord)
        if (column) {
          columns.push(column)
        }
      }
    }

    return columns
  }

  /**
   * Get sub-chunks within a 3D radius of a center point.
   * @param center The center sub-chunk coordinate
   * @param horizontalRadius Radius in chunk columns (x/z)
   * @param verticalRadius Radius in sub-chunk Y indices
   */
  getSubChunksInRadius(
    center: ISubChunkCoordinate,
    horizontalRadius: number,
    verticalRadius: number
  ): SubChunk[] {
    const subChunks: SubChunk[] = []
    const radiusBig = BigInt(horizontalRadius)

    for (let dx = -radiusBig; dx <= radiusBig; dx++) {
      for (let dz = -radiusBig; dz <= radiusBig; dz++) {
        for (let dy = -verticalRadius; dy <= verticalRadius; dy++) {
          const subY = center.subY + dy
          if (subY < 0 || subY >= SUB_CHUNK_COUNT) continue

          const coord: ISubChunkCoordinate = {
            x: center.x + dx,
            z: center.z + dz,
            subY,
          }

          const subChunk = this.getSubChunk(coord)
          if (subChunk) {
            subChunks.push(subChunk)
          }
        }
      }
    }

    return subChunks
  }

  /**
   * Get the number of loaded chunks.
   * @deprecated Use getLoadedColumnCount instead
   */
  getLoadedChunkCount(): number {
    return this.chunks.size
  }

  /**
   * Get the number of loaded columns.
   */
  getLoadedColumnCount(): number {
    return this.columns.size
  }

  /**
   * Get the number of loaded sub-chunks.
   */
  getLoadedSubChunkCount(): number {
    return this.subChunks.size
  }

  /**
   * Update LRU access order for a chunk.
   * @deprecated
   */
  private touchChunk(key: ChunkKey): void {
    this.accessOrder.delete(key)
    this.accessOrder.set(key, true)
  }

  /**
   * Dispose all chunks and sub-chunks.
   */
  dispose(): void {
    // Dispose legacy chunks
    for (const chunk of this.chunks.values()) {
      chunk.dispose()
    }
    this.chunks.clear()
    this.accessOrder.clear()

    // Dispose columns (which dispose their sub-chunks)
    for (const column of this.columns.values()) {
      column.dispose()
    }
    this.columns.clear()
    this.columnsByNumKey.clear()
    this.lastColumnKey = NaN
    this.lastColumn = undefined
    this.subChunks.clear()
  }
}
