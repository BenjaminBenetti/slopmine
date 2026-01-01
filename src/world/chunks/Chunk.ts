import type { BlockId } from '../interfaces/IBlock.ts'
import type { IChunk } from '../interfaces/IChunk.ts'
import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, CHUNK_VOLUME, ChunkState } from '../interfaces/IChunk.ts'
import { localToIndex, isValidLocal } from '../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

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

  /**
   * Light data stored as flat Uint8Array.
   * Each byte: high nibble = skylight (0-15), low nibble = blocklight (0-15)
   * Size: 32 * 32 * 1024 = 1,048,576 bytes = 1 MB per chunk
   */
  private readonly lightData: Uint8Array

  constructor(coordinate: IChunkCoordinate) {
    this.coordinate = coordinate
    this.blocks = new Uint16Array(CHUNK_VOLUME)
    this.lightData = new Uint8Array(CHUNK_VOLUME)
  }

  get state(): ChunkState {
    return this._state
  }

  setState(state: ChunkState): void {
    this._state = state
  }

  getBlockId(x: number, y: number, z: number): BlockId {
    if (!isValidLocal(x, y, z)) {
      return BlockIds.AIR
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
   * Get the raw light data array.
   */
  getLightData(): Uint8Array {
    return this.lightData
  }

  /**
   * Get skylight level at local coordinates (0-15).
   * Returns 15 for out-of-bounds (full sky exposure).
   */
  getSkylight(x: number, y: number, z: number): number {
    if (!isValidLocal(x, y, z)) {
      return 15
    }
    return (this.lightData[localToIndex(x, y, z)] >> 4) & 0xf
  }

  /**
   * Set skylight level at local coordinates (0-15).
   */
  setSkylight(x: number, y: number, z: number, level: number): void {
    if (!isValidLocal(x, y, z)) return
    const idx = localToIndex(x, y, z)
    this.lightData[idx] = (this.lightData[idx] & 0x0f) | ((level & 0xf) << 4)
  }

  /**
   * Get blocklight level at local coordinates (0-15).
   * Returns 0 for out-of-bounds (no artificial light).
   */
  getBlocklight(x: number, y: number, z: number): number {
    if (!isValidLocal(x, y, z)) {
      return 0
    }
    return this.lightData[localToIndex(x, y, z)] & 0xf
  }

  /**
   * Set blocklight level at local coordinates (0-15).
   */
  setBlocklight(x: number, y: number, z: number, level: number): void {
    if (!isValidLocal(x, y, z)) return
    const idx = localToIndex(x, y, z)
    this.lightData[idx] = (this.lightData[idx] & 0xf0) | (level & 0xf)
  }

  /**
   * Get combined light level at local coordinates (max of skylight and blocklight).
   */
  getLightLevel(x: number, y: number, z: number): number {
    if (!isValidLocal(x, y, z)) {
      return 15
    }
    const data = this.lightData[localToIndex(x, y, z)]
    const sky = (data >> 4) & 0xf
    const block = data & 0xf
    return Math.max(sky, block)
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

  /**
   * Iterate over all blocks in the chunk.
   * Callback receives local coordinates and block ID.
   */
  forEachBlock(callback: (x: number, y: number, z: number, blockId: BlockId) => void): void {
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = this.blocks[localToIndex(x, y, z)]
          callback(x, y, z, blockId)
        }
      }
    }
  }

  /**
   * Get highest non-air block Y at local x,z position (top-down scan).
   * This returns the actual surface height including blocks above caves.
   * Returns null if no solid blocks exist at this column.
   */
  getHighestBlockAt(x: number, z: number): number | null {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z) {
      return null
    }

    // Scan from top down to find the highest non-air block
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const blockId = this.blocks[localToIndex(x, y, z)]
      if (blockId !== BlockIds.AIR) {
        return y
      }
    }

    return null
  }

  /**
   * Get highest grounded block Y at local x,z position (bottom-up scan).
   * This returns the height of terrain connected to y=0, stopping at first air gap.
   * Floating blocks (leaves, overhangs) are excluded.
   * Returns null if no grounded blocks exist at this column.
   */
  getGroundedHeightAt(x: number, z: number): number | null {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z) {
      return null
    }

    // Must have a block at y=0 to be grounded
    if (this.blocks[localToIndex(x, 0, z)] === BlockIds.AIR) {
      return null
    }

    // Scan upward, stop at first air gap
    let highestGrounded = 0
    for (let y = 1; y < CHUNK_HEIGHT; y++) {
      const blockId = this.blocks[localToIndex(x, y, z)]
      if (blockId !== BlockIds.AIR) {
        highestGrounded = y
      } else {
        break // Hit air gap, stop
      }
    }

    return highestGrounded
  }

  dispose(): void {
    // Uint16Array will be garbage collected
  }
}
