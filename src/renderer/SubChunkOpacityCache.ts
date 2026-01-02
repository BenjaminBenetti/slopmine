import type { ISubChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'

/**
 * Tracks which sub-chunks are fully opaque (all blocks are opaque).
 * Used for software occlusion culling - opaque sub-chunks can act as occluders.
 */
export class SubChunkOpacityCache {
  private readonly opaqueSubChunks = new Set<SubChunkKey>()

  /**
   * Update opacity status for a sub-chunk.
   */
  updateSubChunk(coord: ISubChunkCoordinate, isOpaque: boolean): void {
    const key = createSubChunkKey(coord.x, coord.z, coord.subY)
    if (isOpaque) {
      this.opaqueSubChunks.add(key)
    } else {
      this.opaqueSubChunks.delete(key)
    }
  }

  /**
   * Check if a sub-chunk is fully opaque.
   */
  isOpaque(coord: ISubChunkCoordinate): boolean {
    const key = createSubChunkKey(coord.x, coord.z, coord.subY)
    return this.opaqueSubChunks.has(key)
  }

  /**
   * Check if a sub-chunk key is fully opaque.
   */
  isOpaqueByKey(key: SubChunkKey): boolean {
    return this.opaqueSubChunks.has(key)
  }

  /**
   * Get all opaque sub-chunk keys.
   */
  getOpaqueSubChunks(): SubChunkKey[] {
    return Array.from(this.opaqueSubChunks)
  }

  /**
   * Get the count of opaque sub-chunks.
   */
  getOpaqueCount(): number {
    return this.opaqueSubChunks.size
  }

  /**
   * Remove a sub-chunk from the cache (when unloaded).
   */
  removeSubChunk(coord: ISubChunkCoordinate): void {
    const key = createSubChunkKey(coord.x, coord.z, coord.subY)
    this.opaqueSubChunks.delete(key)
  }

  /**
   * Remove a sub-chunk by key.
   */
  removeSubChunkByKey(key: SubChunkKey): void {
    this.opaqueSubChunks.delete(key)
  }

  /**
   * Clear all cached opacity data.
   */
  clear(): void {
    this.opaqueSubChunks.clear()
  }
}
