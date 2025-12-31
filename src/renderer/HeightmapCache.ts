import type { Chunk } from '../world/chunks/Chunk.ts'
import type { ChunkKey } from '../world/interfaces/ICoordinates.ts'
import { createChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'

/**
 * Cache of terrain heights for fast lookup during horizon culling.
 * Stores a 4x4 sample grid per chunk with max heights for quick ray casting.
 */
export class HeightmapCache {
  /** Number of samples per axis within each chunk (4x4 = 16 samples per 32x32 chunk) */
  private readonly SAMPLES_PER_AXIS = 4
  /** Distance between sample points in blocks */
  private readonly SAMPLE_SPACING = CHUNK_SIZE_X / this.SAMPLES_PER_AXIS // 8 blocks

  /** Max height for entire chunk (for coarse checks) */
  private readonly chunkMaxHeights = new Map<ChunkKey, number>()
  /** Sample heights grid per chunk */
  private readonly chunkSampleHeights = new Map<ChunkKey, Float32Array>()

  /**
   * Update heightmap cache for a chunk when generated or modified.
   * Samples heights at regular intervals within the chunk.
   */
  updateChunk(chunk: Chunk): void {
    const key = createChunkKey(chunk.coordinate.x, chunk.coordinate.z)
    const totalSamples = this.SAMPLES_PER_AXIS * this.SAMPLES_PER_AXIS
    const samples = new Float32Array(totalSamples)
    let maxHeight = 0

    for (let sz = 0; sz < this.SAMPLES_PER_AXIS; sz++) {
      for (let sx = 0; sx < this.SAMPLES_PER_AXIS; sx++) {
        // Sample at center of each grid cell for better representation
        const localX = Math.floor(sx * this.SAMPLE_SPACING + this.SAMPLE_SPACING / 2)
        const localZ = Math.floor(sz * this.SAMPLE_SPACING + this.SAMPLE_SPACING / 2)

        const height = chunk.getHighestBlockAt(localX, localZ) ?? 0

        samples[sz * this.SAMPLES_PER_AXIS + sx] = height
        maxHeight = Math.max(maxHeight, height)
      }
    }

    this.chunkMaxHeights.set(key, maxHeight)
    this.chunkSampleHeights.set(key, samples)
  }

  /**
   * Remove a chunk from the cache when unloaded.
   */
  removeChunk(chunkKey: ChunkKey): void {
    this.chunkMaxHeights.delete(chunkKey)
    this.chunkSampleHeights.delete(chunkKey)
  }

  /**
   * Get height at world coordinates using bilinear interpolation.
   * Returns 0 if chunk not in cache.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    const chunkX = BigInt(Math.floor(worldX / CHUNK_SIZE_X))
    const chunkZ = BigInt(Math.floor(worldZ / CHUNK_SIZE_Z))
    const key = createChunkKey(chunkX, chunkZ)

    const samples = this.chunkSampleHeights.get(key)
    if (!samples) return 0

    // Local position within chunk [0, CHUNK_SIZE)
    const localX = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X
    const localZ = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z

    // Convert to sample grid coordinates
    const sampleX = localX / this.SAMPLE_SPACING
    const sampleZ = localZ / this.SAMPLE_SPACING

    // Get the 4 nearest sample indices
    const sx0 = Math.floor(sampleX)
    const sz0 = Math.floor(sampleZ)
    const sx1 = Math.min(sx0 + 1, this.SAMPLES_PER_AXIS - 1)
    const sz1 = Math.min(sz0 + 1, this.SAMPLES_PER_AXIS - 1)

    // Interpolation factors
    const fx = sampleX - sx0
    const fz = sampleZ - sz0

    // Get heights at the 4 corners
    const h00 = samples[sz0 * this.SAMPLES_PER_AXIS + sx0]
    const h10 = samples[sz0 * this.SAMPLES_PER_AXIS + sx1]
    const h01 = samples[sz1 * this.SAMPLES_PER_AXIS + sx0]
    const h11 = samples[sz1 * this.SAMPLES_PER_AXIS + sx1]

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx
    const h1 = h01 * (1 - fx) + h11 * fx
    return h0 * (1 - fz) + h1 * fz
  }

  /**
   * Get max height for entire chunk (for coarse early-exit checks).
   */
  getChunkMaxHeight(chunkX: bigint, chunkZ: bigint): number {
    const key = createChunkKey(chunkX, chunkZ)
    return this.chunkMaxHeights.get(key) ?? 0
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.chunkMaxHeights.clear()
    this.chunkSampleHeights.clear()
  }
}
