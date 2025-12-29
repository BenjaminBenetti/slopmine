import type { BlockId } from './IBlock.ts'
import type { IChunkCoordinate } from './ICoordinates.ts'

/**
 * Chunk dimensions constants.
 */
export const CHUNK_SIZE_X = 32
export const CHUNK_SIZE_Z = 32
export const CHUNK_HEIGHT = 1024

/**
 * Total blocks in a chunk for array sizing.
 */
export const CHUNK_VOLUME = CHUNK_SIZE_X * CHUNK_SIZE_Z * CHUNK_HEIGHT

/**
 * Chunk state for lifecycle management.
 */
export enum ChunkState {
  UNLOADED = 0,
  LOADING = 1,
  LOADED = 2,
  GENERATING = 3,
  MESHING = 4,
  READY = 5,
}

/**
 * Core chunk interface for block storage and access.
 */
export interface IChunk {
  readonly coordinate: IChunkCoordinate
  readonly state: ChunkState

  /**
   * Get block ID at local coordinates.
   */
  getBlockId(x: number, y: number, z: number): BlockId

  /**
   * Set block ID at local coordinates.
   * Returns true if the block changed.
   */
  setBlockId(x: number, y: number, z: number, blockId: BlockId): boolean

  /**
   * Check if local coordinates are within bounds.
   */
  isInBounds(x: number, y: number, z: number): boolean

  /**
   * Mark chunk as dirty (needs remeshing).
   */
  markDirty(): void

  /**
   * Check if chunk needs remeshing.
   */
  isDirty(): boolean

  /**
   * Get the raw block data array for serialization/meshing.
   */
  getBlockData(): Uint16Array

  /**
   * Dispose resources.
   */
  dispose(): void
}
