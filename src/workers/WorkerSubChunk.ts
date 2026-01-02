import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { ISubChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import type { ISubChunkData } from '../world/interfaces/ISubChunkData.ts'
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Z,
  SUB_CHUNK_HEIGHT,
  SUB_CHUNK_VOLUME,
} from '../world/interfaces/IChunk.ts'
import { localToSubChunkIndex, isValidSubChunkLocal } from '../world/coordinates/CoordinateUtils.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'

/**
 * Lightweight sub-chunk class for worker context.
 * Implements ISubChunkData interface for compatibility with generation code.
 * No state management, dirty tracking, or WorldManager dependencies.
 */
export class WorkerSubChunk implements ISubChunkData {
  readonly coordinate: ISubChunkCoordinate

  private readonly blocks: Uint16Array
  private readonly lightData: Uint8Array

  constructor(
    chunkX: number,
    chunkZ: number,
    subY: number,
    blocks: Uint16Array,
    lightData: Uint8Array
  ) {
    this.coordinate = { x: BigInt(chunkX), z: BigInt(chunkZ), subY }
    this.blocks = blocks
    this.lightData = lightData
  }

  /**
   * Create a new WorkerSubChunk with empty arrays.
   */
  static create(chunkX: number, chunkZ: number, subY: number): WorkerSubChunk {
    return new WorkerSubChunk(
      chunkX,
      chunkZ,
      subY,
      new Uint16Array(SUB_CHUNK_VOLUME),
      new Uint8Array(SUB_CHUNK_VOLUME)
    )
  }

  /**
   * Get the world Y offset for this sub-chunk.
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
    return true
  }

  isInBounds(x: number, y: number, z: number): boolean {
    return isValidSubChunkLocal(x, y, z)
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
  }

  /**
   * Fill a horizontal layer with a block type.
   * Y is local to sub-chunk (0-63).
   */
  fillLayer(y: number, blockId: BlockId): void {
    if (y < 0 || y >= SUB_CHUNK_HEIGHT) return

    const startIndex = y * CHUNK_SIZE_X * CHUNK_SIZE_Z
    const endIndex = startIndex + CHUNK_SIZE_X * CHUNK_SIZE_Z

    for (let i = startIndex; i < endIndex; i++) {
      this.blocks[i] = blockId
    }
  }

  /**
   * Get highest non-air block Y at local x,z position (top-down scan).
   * Returns local Y (0-63), not world Y.
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
}
