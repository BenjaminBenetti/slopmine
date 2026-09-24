import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'

/**
 * Memoized blended terrain heights for one chunk column.
 *
 * Blended height costs up to 4 terrain evaluations per call and terrain,
 * water, skylight and features all query every column, so the chunk's 32x32
 * columns live in a typed array (NaN = not yet computed) with a Map fallback
 * for the out-of-chunk queries some features make (tree canopies, volcano
 * probes). One instance is shared by every sub-chunk generated from the
 * same column in a worker.
 */
export class ColumnHeights {
  private readonly grid = new Float64Array(CHUNK_SIZE_X * CHUNK_SIZE_Z).fill(NaN)
  private outOfChunk: Map<string, number> | null = null
  private max = NaN

  constructor(
    private readonly chunkWorldX: number,
    private readonly chunkWorldZ: number,
    private readonly compute: (worldX: number, worldZ: number) => number
  ) {}

  /** Blended height at any world column. */
  get(worldX: number, worldZ: number): number {
    const localX = worldX - this.chunkWorldX
    const localZ = worldZ - this.chunkWorldZ
    if (localX >= 0 && localX < CHUNK_SIZE_X && localZ >= 0 && localZ < CHUNK_SIZE_Z) {
      const idx = localZ * CHUNK_SIZE_X + localX
      let height = this.grid[idx]
      if (Number.isNaN(height)) {
        height = this.compute(worldX, worldZ)
        this.grid[idx] = height
      }
      return height
    }
    if (!this.outOfChunk) this.outOfChunk = new Map()
    const key = worldX + ',' + worldZ
    let height = this.outOfChunk.get(key)
    if (height === undefined) {
      height = this.compute(worldX, worldZ)
      this.outOfChunk.set(key, height)
    }
    return height
  }

  /** Highest blended height over the chunk's own columns. */
  getMax(): number {
    if (Number.isNaN(this.max)) {
      let max = -Infinity
      for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
        for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
          const height = this.get(this.chunkWorldX + localX, this.chunkWorldZ + localZ)
          if (height > max) max = height
        }
      }
      this.max = max
    }
    return this.max
  }
}
