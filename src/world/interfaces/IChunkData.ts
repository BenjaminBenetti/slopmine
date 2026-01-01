import type { BlockId } from './IBlock.ts'
import type { IChunkCoordinate } from './ICoordinates.ts'

/**
 * Interface for chunk data access during generation.
 * Both Chunk and WorkerChunk implement this interface,
 * allowing generation code to work with either.
 */
export interface IChunkData {
  readonly coordinate: IChunkCoordinate

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
   * Get skylight level at local coordinates (0-15).
   */
  getSkylight(x: number, y: number, z: number): number

  /**
   * Set skylight level at local coordinates (0-15).
   */
  setSkylight(x: number, y: number, z: number, level: number): void

  /**
   * Get blocklight level at local coordinates (0-15).
   */
  getBlocklight(x: number, y: number, z: number): number

  /**
   * Set blocklight level at local coordinates (0-15).
   */
  setBlocklight(x: number, y: number, z: number, level: number): void

  /**
   * Get raw block data array.
   */
  getBlockData(): Uint16Array

  /**
   * Get raw light data array.
   */
  getLightData(): Uint8Array

  /**
   * Get highest non-air block Y at local x,z position.
   */
  getHighestBlockAt(x: number, z: number): number | null
}
