import type { BlockId } from '../interfaces/IBlock.ts'
import type { ISubChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT, SUB_CHUNK_VOLUME, ChunkState } from '../interfaces/IChunk.ts'
import { localToSubChunkIndex, isValidSubChunkLocal } from '../coordinates/CoordinateUtils.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

/**
 * SubChunk implementation using Uint16Array for block storage.
 * Each sub-chunk is 32x32x64 blocks (1/16th of a full column).
 * Memory layout: Y-major for cache-friendly horizontal access.
 */
export class SubChunk {
  readonly coordinate: ISubChunkCoordinate

  private _state: ChunkState = ChunkState.UNLOADED
  private _dirty = false

  /**
   * Block data stored as flat Uint16Array.
   * Size: 32 * 32 * 64 = 65,536 blocks
   * Memory: 65,536 * 2 bytes = 128 KB per sub-chunk
   */
  private readonly blocks: Uint16Array

  /**
   * Light data stored as flat Uint8Array.
   * Each byte: high nibble = skylight (0-15), low nibble = blocklight (0-15)
   * Size: 32 * 32 * 64 = 65,536 bytes = 64 KB per sub-chunk
   */
  private readonly lightData: Uint8Array

  constructor(coordinate: ISubChunkCoordinate) {
    this.coordinate = coordinate
    this.blocks = new Uint16Array(SUB_CHUNK_VOLUME)
    this.lightData = new Uint8Array(SUB_CHUNK_VOLUME)
  }

  get state(): ChunkState {
    return this._state
  }

  setState(state: ChunkState): void {
    this._state = state
  }

  /**
   * Get the world Y offset for this sub-chunk.
   * Sub-chunk 0 starts at Y=0, sub-chunk 1 at Y=64, etc.
   */
  get worldYOffset(): number {
    return this.coordinate.subY * SUB_CHUNK_HEIGHT
  }

  getBlockId(x: number, y: number, z: number): BlockId {
    if (!isValidSubChunkLocal(x, y, z)) {
      return BlockIds.AIR
    }
    return this.blocks[localToSubChunkIndex(x, y, z)]
  }

  setBlockId(x: number, y: number, z: number, blockId: BlockId): boolean {
    if (!isValidSubChunkLocal(x, y, z)) {
      return false
    }

    const index = localToSubChunkIndex(x, y, z)
    const oldId = this.blocks[index]

    if (oldId === blockId) {
      return false
    }

    this.blocks[index] = blockId
    this._dirty = true
    return true
  }

  isInBounds(x: number, y: number, z: number): boolean {
    return isValidSubChunkLocal(x, y, z)
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

  getLightData(): Uint8Array {
    return this.lightData
  }

  /**
   * Get skylight level at local coordinates (0-15).
   * Returns 15 for out-of-bounds (full sky exposure).
   */
  getSkylight(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 15
    }
    return (this.lightData[localToSubChunkIndex(x, y, z)] >> 4) & 0xf
  }

  /**
   * Set skylight level at local coordinates (0-15).
   */
  setSkylight(x: number, y: number, z: number, level: number): void {
    if (!isValidSubChunkLocal(x, y, z)) return
    const idx = localToSubChunkIndex(x, y, z)
    this.lightData[idx] = (this.lightData[idx] & 0x0f) | ((level & 0xf) << 4)
  }

  /**
   * Get blocklight level at local coordinates (0-15).
   * Returns 0 for out-of-bounds (no artificial light).
   */
  getBlocklight(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 0
    }
    return this.lightData[localToSubChunkIndex(x, y, z)] & 0xf
  }

  /**
   * Set blocklight level at local coordinates (0-15).
   */
  setBlocklight(x: number, y: number, z: number, level: number): void {
    if (!isValidSubChunkLocal(x, y, z)) return
    const idx = localToSubChunkIndex(x, y, z)
    this.lightData[idx] = (this.lightData[idx] & 0xf0) | (level & 0xf)
  }

  /**
   * Get combined light level at local coordinates (max of skylight and blocklight).
   */
  getLightLevel(x: number, y: number, z: number): number {
    if (!isValidSubChunkLocal(x, y, z)) {
      return 15
    }
    const data = this.lightData[localToSubChunkIndex(x, y, z)]
    const sky = (data >> 4) & 0xf
    const block = data & 0xf
    return Math.max(sky, block)
  }

  /**
   * Fill entire sub-chunk with a block type.
   */
  fill(blockId: BlockId): void {
    this.blocks.fill(blockId)
    this._dirty = true
  }

  /**
   * Fill a horizontal layer with a block type.
   * Y is local to the sub-chunk (0-63).
   */
  fillLayer(y: number, blockId: BlockId): void {
    if (y < 0 || y >= SUB_CHUNK_HEIGHT) return

    const startIndex = y * CHUNK_SIZE_X * CHUNK_SIZE_Z
    const endIndex = startIndex + CHUNK_SIZE_X * CHUNK_SIZE_Z

    for (let i = startIndex; i < endIndex; i++) {
      this.blocks[i] = blockId
    }
    this._dirty = true
  }

  /**
   * Iterate over all blocks in the sub-chunk.
   * Callback receives local coordinates and block ID.
   */
  forEachBlock(callback: (x: number, y: number, z: number, blockId: BlockId) => void): void {
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = this.blocks[localToSubChunkIndex(x, y, z)]
          callback(x, y, z, blockId)
        }
      }
    }
  }

  /**
   * Get highest non-air block Y at local x,z position (top-down scan).
   * Returns local Y (0-63), not world Y.
   * Returns null if no solid blocks exist at this column.
   */
  getHighestBlockAt(x: number, z: number): number | null {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z) {
      return null
    }

    for (let y = SUB_CHUNK_HEIGHT - 1; y >= 0; y--) {
      const blockId = this.blocks[localToSubChunkIndex(x, y, z)]
      if (blockId !== BlockIds.AIR) {
        return y
      }
    }

    return null
  }

  /**
   * Check if the sub-chunk is entirely empty (all air).
   * Useful for skipping mesh generation.
   */
  isEmpty(): boolean {
    for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
      if (this.blocks[i] !== BlockIds.AIR) {
        return false
      }
    }
    return true
  }

  /**
   * Apply bulk data from worker generation result.
   */
  applyWorkerData(blocks: Uint16Array, lightData: Uint8Array): void {
    if (!this._dirty) {
      this.blocks.set(blocks)
      this.lightData.set(lightData)
    } else {
      // Merge: Keep existing non-air blocks, overwrite air with worker data
      for (let i = 0; i < SUB_CHUNK_VOLUME; i++) {
        if (this.blocks[i] === BlockIds.AIR) {
          this.blocks[i] = blocks[i]
          this.lightData[i] = lightData[i]
        }
        // If block is not AIR, we keep it (e.g., placed tree leaves)
        // We generally keep the existing light data for it too, or we could accept worker light?
        // For now, assume existing light is "valid enough" or will be fixed by relighting.
      }
    }
    this._dirty = true
  }

  dispose(): void {
    // Uint16Array will be garbage collected
  }
}
