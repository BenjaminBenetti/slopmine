import type { Chunk } from '../world/chunks/Chunk.ts'
import type { ChunkKey } from '../world/interfaces/ICoordinates.ts'
import { createChunkKey } from '../world/interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'

/**
 * Serialized heightmap data for transfer to workers.
 */
export interface SerializedHeightmap {
  surfaceSamples: Array<[string, Float32Array]>
  groundedSamples: Array<[string, Float32Array]>
  maxHeights: Array<[string, number]>
}

/**
 * Cache of terrain heights for fast lookup during horizon culling.
 * Stores two height grids per chunk:
 * - Surface heights (top-down): for ray TARGETS (what we're trying to see)
 * - Grounded heights (bottom-up): for ray BLOCKING (solid terrain that blocks view)
 */
export class HeightmapCache {
  /** Number of samples per axis within each chunk (4x4 = 16 samples per 32x32 chunk) */
  private readonly SAMPLES_PER_AXIS = 4
  /** Distance between sample points in blocks */
  private readonly SAMPLE_SPACING = CHUNK_SIZE_X / this.SAMPLES_PER_AXIS // 8 blocks

  /** Max height for entire chunk (for coarse checks) */
  private readonly chunkMaxHeights = new Map<ChunkKey, number>()
  /** Surface heights - top-down scan (includes blocks above caves) */
  private readonly chunkSurfaceHeights = new Map<ChunkKey, Float32Array>()
  /** Grounded heights - bottom-up scan (stops at first air gap) */
  private readonly chunkGroundedHeights = new Map<ChunkKey, Float32Array>()

  /**
   * Update heightmap cache for a chunk when generated or modified.
   * Samples both surface and grounded heights at regular intervals.
   */
  updateChunk(chunk: Chunk): void {
    const key = createChunkKey(chunk.coordinate.x, chunk.coordinate.z)
    const totalSamples = this.SAMPLES_PER_AXIS * this.SAMPLES_PER_AXIS
    const surfaceSamples = new Float32Array(totalSamples)
    const groundedSamples = new Float32Array(totalSamples)
    let maxHeight = 0

    for (let sz = 0; sz < this.SAMPLES_PER_AXIS; sz++) {
      for (let sx = 0; sx < this.SAMPLES_PER_AXIS; sx++) {
        const localX = Math.floor(sx * this.SAMPLE_SPACING + this.SAMPLE_SPACING / 2)
        const localZ = Math.floor(sz * this.SAMPLE_SPACING + this.SAMPLE_SPACING / 2)
        const idx = sz * this.SAMPLES_PER_AXIS + sx

        // Surface height: top-down scan (target for rays)
        const surfaceHeight = chunk.getHighestBlockAt(localX, localZ) ?? 0
        surfaceSamples[idx] = surfaceHeight
        maxHeight = Math.max(maxHeight, surfaceHeight)

        // Grounded height: bottom-up scan (blocks rays)
        const groundedHeight = chunk.getGroundedHeightAt(localX, localZ) ?? 0
        groundedSamples[idx] = groundedHeight
      }
    }

    this.chunkMaxHeights.set(key, maxHeight)
    this.chunkSurfaceHeights.set(key, surfaceSamples)
    this.chunkGroundedHeights.set(key, groundedSamples)
  }

  /**
   * Remove a chunk from the cache when unloaded.
   */
  removeChunk(chunkKey: ChunkKey): void {
    this.chunkMaxHeights.delete(chunkKey)
    this.chunkSurfaceHeights.delete(chunkKey)
    this.chunkGroundedHeights.delete(chunkKey)
  }

  /**
   * Get surface height at world coordinates (top-down, for ray targets).
   * Returns 0 if chunk not in cache.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    return this.interpolateHeight(worldX, worldZ, this.chunkSurfaceHeights)
  }

  /**
   * Get grounded height at world coordinates (bottom-up, for ray blocking).
   * Returns 0 if chunk not in cache.
   */
  getGroundedHeightAt(worldX: number, worldZ: number): number {
    return this.interpolateHeight(worldX, worldZ, this.chunkGroundedHeights)
  }

  /**
   * Bilinear interpolation helper for height lookups.
   */
  private interpolateHeight(
    worldX: number,
    worldZ: number,
    samples: Map<ChunkKey, Float32Array>
  ): number {
    const chunkX = BigInt(Math.floor(worldX / CHUNK_SIZE_X))
    const chunkZ = BigInt(Math.floor(worldZ / CHUNK_SIZE_Z))
    const key = createChunkKey(chunkX, chunkZ)

    const sampleData = samples.get(key)
    if (!sampleData) return 0

    const localX = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X
    const localZ = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z

    const sampleX = localX / this.SAMPLE_SPACING
    const sampleZ = localZ / this.SAMPLE_SPACING

    const sx0 = Math.floor(sampleX)
    const sz0 = Math.floor(sampleZ)
    const sx1 = Math.min(sx0 + 1, this.SAMPLES_PER_AXIS - 1)
    const sz1 = Math.min(sz0 + 1, this.SAMPLES_PER_AXIS - 1)

    const fx = sampleX - sx0
    const fz = sampleZ - sz0

    const h00 = sampleData[sz0 * this.SAMPLES_PER_AXIS + sx0]
    const h10 = sampleData[sz0 * this.SAMPLES_PER_AXIS + sx1]
    const h01 = sampleData[sz1 * this.SAMPLES_PER_AXIS + sx0]
    const h11 = sampleData[sz1 * this.SAMPLES_PER_AXIS + sx1]

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
    this.chunkSurfaceHeights.clear()
    this.chunkGroundedHeights.clear()
  }

  /**
   * Serialize heightmap data for transfer to a worker.
   */
  serialize(): SerializedHeightmap {
    return {
      surfaceSamples: Array.from(this.chunkSurfaceHeights.entries()),
      groundedSamples: Array.from(this.chunkGroundedHeights.entries()),
      maxHeights: Array.from(this.chunkMaxHeights.entries()),
    }
  }
}
