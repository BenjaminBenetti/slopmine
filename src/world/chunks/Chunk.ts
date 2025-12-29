import type { BlockId } from '../interfaces/IBlock.ts'
import type { IChunk } from '../interfaces/IChunk.ts'
import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, CHUNK_VOLUME, ChunkState } from '../interfaces/IChunk.ts'
import { localToIndex, isValidLocal } from '../coordinates/CoordinateUtils.ts'
import { AIR_BLOCK_ID } from '../interfaces/IBlock.ts'

/**
 * Chunk implementation using Uint16Array for block storage.
 * Memory layout: Y-major for cache-friendly horizontal access.
 */
export class Chunk implements IChunk {
  readonly coordinate: IChunkCoordinate

  private _state: ChunkState = ChunkState.UNLOADED
  private _dirty = false

  /**
   * Block data stored as flat Uint16Array.
   * Size: 32 * 32 * 1024 = 1,048,576 blocks
   * Memory: 1,048,576 * 2 bytes = 2 MB per chunk
   */
  private readonly blocks: Uint16Array

  constructor(coordinate: IChunkCoordinate) {
    this.coordinate = coordinate
    this.blocks = new Uint16Array(CHUNK_VOLUME)
  }

  get state(): ChunkState {
    return this._state
  }

  setState(state: ChunkState): void {
    this._state = state
  }

  getBlockId(x: number, y: number, z: number): BlockId {
    if (!isValidLocal(x, y, z)) {
      return AIR_BLOCK_ID
    }
    return this.blocks[localToIndex(x, y, z)]
  }

  setBlockId(x: number, y: number, z: number, blockId: BlockId): boolean {
    if (!isValidLocal(x, y, z)) {
      return false
    }

    const index = localToIndex(x, y, z)
    const oldId = this.blocks[index]

    if (oldId === blockId) {
      return false
    }

    this.blocks[index] = blockId
    this._dirty = true
    return true
  }

  isInBounds(x: number, y: number, z: number): boolean {
    return isValidLocal(x, y, z)
  }

  markDirty(): void {
    this._dirty = true
  }

  isDirty(): boolean {
    return this._dirty
  }

  clearDirty(): void {
    this._dirty = false
  }

  getBlockData(): Uint16Array {
    return this.blocks
  }

  /**
   * Fill entire chunk with a block type.
   * Useful for testing and flat world generation.
   */
  fill(blockId: BlockId): void {
    this.blocks.fill(blockId)
    this._dirty = true
  }

  /**
   * Fill a horizontal layer with a block type.
   */
  fillLayer(y: number, blockId: BlockId): void {
    if (y < 0 || y >= CHUNK_HEIGHT) return

    const startIndex = y * CHUNK_SIZE_X * CHUNK_SIZE_Z
    const endIndex = startIndex + CHUNK_SIZE_X * CHUNK_SIZE_Z

    for (let i = startIndex; i < endIndex; i++) {
      this.blocks[i] = blockId
    }
    this._dirty = true
  }

  dispose(): void {
    // Uint16Array will be garbage collected
  }
}
