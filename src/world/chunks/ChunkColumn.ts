import type { BlockId } from '../interfaces/IBlock.ts'
import type { IChunkCoordinate } from '../interfaces/ICoordinates.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import { SubChunk } from './SubChunk.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

/**
 * ChunkColumn manages a vertical stack of 16 sub-chunks.
 * Provides unified access to blocks across all sub-chunks in a column.
 */
export class ChunkColumn {
  readonly coordinate: IChunkCoordinate

  /**
   * Array of 16 sub-chunks (indices 0-15).
   * Sub-chunk 0 covers Y=0-63, sub-chunk 1 covers Y=64-127, etc.
   * May be null if the sub-chunk hasn't been generated yet.
   */
  private readonly subChunks: (SubChunk | null)[] = new Array(SUB_CHUNK_COUNT).fill(null)

  constructor(coordinate: IChunkCoordinate) {
    this.coordinate = coordinate
  }

  /**
   * Get a sub-chunk by its Y index (0-15).
   */
  getSubChunk(subY: number): SubChunk | null {
    if (subY < 0 || subY >= SUB_CHUNK_COUNT) {
      return null
    }
    return this.subChunks[subY]
  }

  /**
   * Get or create a sub-chunk at the given Y index.
   */
  getOrCreateSubChunk(subY: number): SubChunk {
    if (subY < 0 || subY >= SUB_CHUNK_COUNT) {
      throw new Error(`Invalid sub-chunk Y index: ${subY}`)
    }

    let subChunk = this.subChunks[subY]
    if (!subChunk) {
      subChunk = new SubChunk({
        x: this.coordinate.x,
        z: this.coordinate.z,
        subY,
      })
      this.subChunks[subY] = subChunk
    }
    return subChunk
  }

  /**
   * Set a sub-chunk at the given Y index.
   */
  setSubChunk(subY: number, subChunk: SubChunk): void {
    if (subY < 0 || subY >= SUB_CHUNK_COUNT) {
      throw new Error(`Invalid sub-chunk Y index: ${subY}`)
    }
    this.subChunks[subY] = subChunk
  }

  /**
   * Get block ID using world Y coordinate (0-1023).
   */
  getBlockId(x: number, worldY: number, z: number): BlockId {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return BlockIds.AIR
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.subChunks[subY]

    if (!subChunk) {
      return BlockIds.AIR
    }

    return subChunk.getBlockId(x, localY, z)
  }

  /**
   * Set block ID using world Y coordinate (0-1023).
   * Returns true if the block was changed.
   */
  setBlockId(x: number, worldY: number, z: number, blockId: BlockId): boolean {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return false
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.getOrCreateSubChunk(subY)

    return subChunk.setBlockId(x, localY, z, blockId)
  }

  /**
   * Get skylight at world Y coordinate.
   */
  getSkylight(x: number, worldY: number, z: number): number {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return worldY >= CHUNK_HEIGHT ? 15 : 0
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.subChunks[subY]

    if (!subChunk) {
      return 15 // Unloaded = assume full sky
    }

    return subChunk.getSkylight(x, localY, z)
  }

  /**
   * Set skylight at world Y coordinate.
   */
  setSkylight(x: number, worldY: number, z: number, level: number): void {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.getOrCreateSubChunk(subY)

    subChunk.setSkylight(x, localY, z, level)
  }

  /**
   * Get blocklight at world Y coordinate.
   */
  getBlocklight(x: number, worldY: number, z: number): number {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return 0
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.subChunks[subY]

    if (!subChunk) {
      return 0
    }

    return subChunk.getBlocklight(x, localY, z)
  }

  /**
   * Set blocklight at world Y coordinate.
   */
  setBlocklight(x: number, worldY: number, z: number, level: number): void {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.getOrCreateSubChunk(subY)

    subChunk.setBlocklight(x, localY, z, level)
  }

  /**
   * Get combined light level at world Y coordinate.
   */
  getLightLevel(x: number, worldY: number, z: number): number {
    if (worldY < 0 || worldY >= CHUNK_HEIGHT) {
      return worldY >= CHUNK_HEIGHT ? 15 : 0
    }

    const subY = Math.floor(worldY / SUB_CHUNK_HEIGHT)
    const localY = worldY % SUB_CHUNK_HEIGHT
    const subChunk = this.subChunks[subY]

    if (!subChunk) {
      return 15
    }

    return subChunk.getLightLevel(x, localY, z)
  }

  /**
   * Check if world Y coordinate is valid.
   */
  isInBounds(x: number, worldY: number, z: number): boolean {
    return x >= 0 && x < CHUNK_SIZE_X &&
           worldY >= 0 && worldY < CHUNK_HEIGHT &&
           z >= 0 && z < CHUNK_SIZE_Z
  }

  /**
   * Get highest non-air block Y at local x,z position.
   * Scans from top sub-chunk down.
   * Returns world Y coordinate, or null if entirely air.
   */
  getHighestBlockAt(x: number, z: number): number | null {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z) {
      return null
    }

    for (let subY = SUB_CHUNK_COUNT - 1; subY >= 0; subY--) {
      const subChunk = this.subChunks[subY]
      if (!subChunk) continue

      const localY = subChunk.getHighestBlockAt(x, z)
      if (localY !== null) {
        return subY * SUB_CHUNK_HEIGHT + localY
      }
    }

    return null
  }

  /**
   * Get highest grounded block Y at local x,z position.
   * Scans from bottom up, stops at first air gap.
   * Returns world Y coordinate, or null if no grounded blocks.
   */
  getGroundedHeightAt(x: number, z: number): number | null {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z) {
      return null
    }

    // Must have a block at y=0 to be grounded
    const bottomSubChunk = this.subChunks[0]
    if (!bottomSubChunk || bottomSubChunk.getBlockId(x, 0, z) === BlockIds.AIR) {
      return null
    }

    let highestGrounded = 0

    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      const subChunk = this.subChunks[subY]
      if (!subChunk) break // No sub-chunk = air gap

      const baseY = subY * SUB_CHUNK_HEIGHT
      let hitAir = false

      for (let localY = 0; localY < SUB_CHUNK_HEIGHT; localY++) {
        const blockId = subChunk.getBlockId(x, localY, z)
        if (blockId !== BlockIds.AIR) {
          highestGrounded = baseY + localY
        } else {
          hitAir = true
          break
        }
      }

      if (hitAir) break
    }

    return highestGrounded
  }

  /**
   * Get all sub-chunks that are dirty (need remeshing).
   * Returns array of sub-chunk Y indices.
   */
  getDirtySubChunks(): number[] {
    const dirty: number[] = []
    for (let subY = 0; subY < SUB_CHUNK_COUNT; subY++) {
      const subChunk = this.subChunks[subY]
      if (subChunk?.isDirty()) {
        dirty.push(subY)
      }
    }
    return dirty
  }

  /**
   * Get all loaded sub-chunks.
   */
  getLoadedSubChunks(): SubChunk[] {
    return this.subChunks.filter((sc): sc is SubChunk => sc !== null)
  }

  /**
   * Get the number of loaded sub-chunks.
   */
  getLoadedSubChunkCount(): number {
    return this.subChunks.filter(sc => sc !== null).length
  }

  /**
   * Check if all sub-chunks in the column are loaded.
   */
  isFullyLoaded(): boolean {
    return this.subChunks.every(sc => sc !== null)
  }

  /**
   * Dispose all sub-chunks.
   */
  dispose(): void {
    for (const subChunk of this.subChunks) {
      subChunk?.dispose()
    }
    this.subChunks.fill(null)
  }
}
