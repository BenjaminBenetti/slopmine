import type { BlockId } from './IBlock.ts'
import type { ISubChunkCoordinate } from './ICoordinates.ts'

/**
 * Interface for sub-chunk data access during generation.
 * Both SubChunk and WorkerSubChunk implement this interface,
 * allowing generation code to work with either.
 */
export interface ISubChunkData {
  readonly coordinate: ISubChunkCoordinate

  /**
   * Get block ID at local coordinates.
   * Y is local to the sub-chunk (0-63).
   */
  getBlockId(x: number, y: number, z: number): BlockId

  /**
   * Set block ID at local coordinates.
   * Y is local to the sub-chunk (0-63).
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
   * Returns local Y (0-63), not world Y.
   */
  getHighestBlockAt(x: number, z: number): number | null
}
