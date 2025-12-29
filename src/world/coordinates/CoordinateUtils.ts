import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import type { IWorldCoordinate, IChunkCoordinate, ILocalCoordinate } from '../interfaces/ICoordinates.ts'

/**
 * Constants for bit shifting operations.
 * 32 = 2^5, so we shift by 5 bits for chunk conversion.
 */
const CHUNK_SHIFT = 5n
const CHUNK_MASK = 31n

/**
 * Convert world coordinates to chunk coordinates.
 * Uses arithmetic right shift for floor division with negative numbers.
 */
export function worldToChunk(world: IWorldCoordinate): IChunkCoordinate {
  return {
    x: world.x >> CHUNK_SHIFT,
    z: world.z >> CHUNK_SHIFT,
  }
}

/**
 * Positive modulo operation that always returns a non-negative result.
 */
function positiveMod(n: bigint, m: bigint): number {
  const result = n % m
  return Number(result >= 0n ? result : result + m)
}

/**
 * Convert world coordinates to local chunk coordinates.
 * Result is always in range [0, 31] for x/z.
 */
export function worldToLocal(world: IWorldCoordinate): ILocalCoordinate {
  return {
    x: positiveMod(world.x, BigInt(CHUNK_SIZE_X)),
    y: Number(world.y),
    z: positiveMod(world.z, BigInt(CHUNK_SIZE_Z)),
  }
}

/**
 * Convert chunk + local coordinates back to world coordinates.
 */
export function localToWorld(chunk: IChunkCoordinate, local: ILocalCoordinate): IWorldCoordinate {
  return {
    x: (chunk.x << CHUNK_SHIFT) + BigInt(local.x),
    y: BigInt(local.y),
    z: (chunk.z << CHUNK_SHIFT) + BigInt(local.z),
  }
}

/**
 * Calculate index into a flat array for 3D coordinates.
 * Memory layout: Y-major (y * SIZE_X * SIZE_Z + z * SIZE_X + x)
 * This layout is cache-friendly for horizontal slice operations.
 */
export function localToIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
}

/**
 * Reverse: index to local coordinates.
 */
export function indexToLocal(index: number): ILocalCoordinate {
  const sliceSize = CHUNK_SIZE_X * CHUNK_SIZE_Z
  const y = Math.floor(index / sliceSize)
  const remainder = index % sliceSize
  const z = Math.floor(remainder / CHUNK_SIZE_X)
  const x = remainder % CHUNK_SIZE_X
  return { x, y, z }
}

/**
 * Check if local coordinates are valid.
 */
export function isValidLocal(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE_X &&
         y >= 0 && y < CHUNK_HEIGHT &&
         z >= 0 && z < CHUNK_SIZE_Z
}

/**
 * Get neighbor chunk coordinate offset for a given direction.
 */
export function getNeighborChunk(
  chunk: IChunkCoordinate,
  deltaX: number,
  deltaZ: number
): IChunkCoordinate {
  return {
    x: chunk.x + BigInt(deltaX),
    z: chunk.z + BigInt(deltaZ),
  }
}
