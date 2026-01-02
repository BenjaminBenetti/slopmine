import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import type { IWorldCoordinate, IChunkCoordinate, ILocalCoordinate } from '../interfaces/ICoordinates.ts'

// Pre-convert to BigInt for performance
const SIZE_X_BI = BigInt(CHUNK_SIZE_X)
const SIZE_Z_BI = BigInt(CHUNK_SIZE_Z)

/**
 * Helper for BigInt floor division (handles negatives correctly).
 * Equivalent to Math.floor(n / d)
 */
function floorDiv(n: bigint, d: bigint): bigint {
  return n >= 0n ? n / d : (n - d + 1n) / d
}

/**
 * Convert world coordinates to chunk coordinates.
 */
export function worldToChunk(world: IWorldCoordinate): IChunkCoordinate {
  return {
    x: floorDiv(world.x, SIZE_X_BI),
    z: floorDiv(world.z, SIZE_Z_BI),
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
 * Result is always in range [0, SIZE-1].
 */
export function worldToLocal(world: IWorldCoordinate): ILocalCoordinate {
  return {
    x: positiveMod(world.x, SIZE_X_BI),
    y: Number(world.y),
    z: positiveMod(world.z, SIZE_Z_BI),
  }
}

/**
 * Convert chunk + local coordinates back to world coordinates.
 */
export function localToWorld(chunk: IChunkCoordinate, local: ILocalCoordinate): IWorldCoordinate {
  return {
    x: (chunk.x * SIZE_X_BI) + BigInt(local.x),
    y: BigInt(local.y),
    z: (chunk.z * SIZE_Z_BI) + BigInt(local.z),
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

/**
 * Calculate index into a sub-chunk flat array for 3D coordinates.
 * Memory layout: Y-major (y * SIZE_X * SIZE_Z + z * SIZE_X + x)
 * Y range is 0-63 for sub-chunks.
 */
export function localToSubChunkIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE_X * CHUNK_SIZE_Z + z * CHUNK_SIZE_X + x
}

/**
 * Check if local coordinates are valid for a sub-chunk.
 * Y range is 0-63 instead of 0-1023.
 */
export function isValidSubChunkLocal(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE_X &&
         y >= 0 && y < SUB_CHUNK_HEIGHT &&
         z >= 0 && z < CHUNK_SIZE_Z
}
