import type { IChunkCoordinate, ChunkKey } from '../interfaces/ICoordinates.ts'
import { createChunkKey, parseChunkKey } from '../interfaces/ICoordinates.ts'
import { Chunk } from './Chunk.ts'
import { ChunkState } from '../interfaces/IChunk.ts'

/**
 * Manages chunk lifecycle: loading, unloading, caching.
 */
export class ChunkManager {
  private readonly chunks: Map<ChunkKey, Chunk> = new Map()
  private readonly accessOrder: Map<ChunkKey, true> = new Map()

  /**
   * Get a chunk, returning undefined if not loaded.
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
   */
  hasChunk(coordinate: IChunkCoordinate): boolean {
    const key = createChunkKey(coordinate.x, coordinate.z)
    return this.chunks.has(key)
  }

  /**
   * Load or create a chunk at the given coordinates.
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
   * Get all loaded chunks.
   */
  getLoadedChunks(): Chunk[] {
    return Array.from(this.chunks.values())
  }

  /**
   * Get all dirty chunks that need remeshing.
   */
  getDirtyChunks(): Chunk[] {
    return this.getLoadedChunks().filter(chunk => chunk.isDirty())
  }

  /**
   * Get chunks within a radius of a center point.
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

  /**
   * Get the number of loaded chunks.
   */
  getLoadedChunkCount(): number {
    return this.chunks.size
  }

  /**
   * Update LRU access order for a chunk.
   * Deleting and re-setting moves the key to the end of Map iteration order.
   */
  private touchChunk(key: ChunkKey): void {
    this.accessOrder.delete(key)
    this.accessOrder.set(key, true)
  }

  /**
   * Dispose all chunks.
   */
  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose()
    }
    this.chunks.clear()
    this.accessOrder.clear()
  }
}
