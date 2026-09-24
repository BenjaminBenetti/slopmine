import type { BiomeBlendData } from '../../../workers/ChunkGenerationWorker.ts'
import type { SurfaceBandProvider } from '../../generate/WorldGenerator.ts'
import type { IChunkCoordinate, ISubChunkCoordinate } from '../../interfaces/ICoordinates.ts'

/** Generation parameters LOD tiles share with full-detail generation. */
export interface LodGenerationParams {
  readonly seed: number
  readonly seaLevel: number
  readonly terrainThickness: number
  /** Full-detail load distance in chunks. */
  readonly chunkDistance: number
}

/**
 * What LodManager needs from full-detail world generation (WorldGenerator
 * satisfies it): the same biome blend data for tiles, a busy signal for
 * throttling, the surface-band hook that makes every in-range column load
 * the sub-chunks its LOD tile says hold its surface, and load lifecycle
 * events for the handoff.
 */
export interface ILodWorldSource {
  getConfig(): LodGenerationParams
  getBlendDataForChunk(chunkX: number, chunkZ: number, layer: 0 | 1): BiomeBlendData
  /** Sub-chunks waiting for full-detail generation. */
  getQueuedCount(): number
  setSurfaceBandProvider(provider: SurfaceBandProvider | null): void
  /** Re-evaluate one column's load set after its surface band changed. */
  refreshSurfaceBand(chunkX: number, chunkZ: number): void
  /**
   * Lowest sub-chunk of a column's surface band given its bottom `subY`:
   * lower when the loaded data shows the ground cut below it (ravines).
   */
  getSurfaceBandFloor(chunkX: number, chunkZ: number, subY: number): number
  /** A sub-chunk's generated or saved data was applied. Returns an unsubscribe function. */
  onSubChunkApplied(listener: (coordinate: ISubChunkCoordinate) => void): () => void
  /** A column unloaded. Returns an unsubscribe function. */
  onColumnUnloaded(listener: (coordinate: IChunkCoordinate) => void): () => void
  /** Listen for single sub-chunks unloaded while their column stays. Returns an unsubscribe function. */
  onSubChunkUnloaded?(listener: (coordinate: ISubChunkCoordinate) => void): () => void
}
