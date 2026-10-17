import type { IChunkData } from '../../../interfaces/IChunkData.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../../interfaces/IChunk.ts'
import type { ISubChunkCoordinate } from '../../../interfaces/ICoordinates.ts'

/**
 * World-coordinate block access clipped to the sub-chunk a feature is
 * generating: structures are stamped in world space and every slice keeps
 * only the cells it owns.
 */
export class SliceWriter {
  readonly minX: number
  readonly minZ: number
  readonly minY: number
  readonly maxX: number
  readonly maxZ: number
  readonly maxY: number

  constructor(readonly chunk: IChunkData) {
    const coord = chunk.coordinate as ISubChunkCoordinate
    const subY = typeof coord.subY === 'number' ? coord.subY : 0
    this.minX = Number(coord.x) * CHUNK_SIZE_X
    this.minZ = Number(coord.z) * CHUNK_SIZE_Z
    this.minY = subY * SUB_CHUNK_HEIGHT
    this.maxX = this.minX + CHUNK_SIZE_X - 1
    this.maxZ = this.minZ + CHUNK_SIZE_Z - 1
    this.maxY = this.minY + SUB_CHUNK_HEIGHT - 1
  }

  contains(x: number, y: number, z: number): boolean {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ && y >= this.minY && y <= this.maxY
  }

  /** True if the box [x0,x1]x[y0,y1]x[z0,z1] overlaps this slice. */
  overlaps(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): boolean {
    return x1 >= this.minX && x0 <= this.maxX && z1 >= this.minZ && z0 <= this.maxZ && y1 >= this.minY && y0 <= this.maxY
  }

  set(x: number, y: number, z: number, blockId: number): void {
    if (!this.contains(x, y, z)) return
    this.chunk.setBlockId(x - this.minX, y - this.minY, z - this.minZ, blockId)
  }

  /** Block id at a world cell, or -1 outside this slice. */
  get(x: number, y: number, z: number): number {
    if (!this.contains(x, y, z)) return -1
    return this.chunk.getBlockId(x - this.minX, y - this.minY, z - this.minZ)
  }
}
