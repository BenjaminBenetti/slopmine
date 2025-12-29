/**
 * World coordinates using BigInt for unlimited world size.
 * These represent absolute block positions in the world.
 */
export interface IWorldCoordinate {
  readonly x: bigint
  readonly y: bigint
  readonly z: bigint
}

/**
 * Chunk coordinates using BigInt.
 * Each chunk is 32x32 blocks horizontally.
 */
export interface IChunkCoordinate {
  readonly x: bigint
  readonly z: bigint
}

/**
 * Local coordinates within a chunk (0-31 range for x/z).
 * Y coordinate represents height within the chunk column.
 */
export interface ILocalCoordinate {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Chunk key for Map-based storage using BigInt.
 * Format: "x,z" as string since BigInt can't be used directly as Map key.
 */
export type ChunkKey = string

/**
 * Create a chunk key from coordinates.
 */
export function createChunkKey(x: bigint, z: bigint): ChunkKey {
  return `${x},${z}`
}

/**
 * Parse a chunk key back to coordinates.
 */
export function parseChunkKey(key: ChunkKey): IChunkCoordinate {
  const [x, z] = key.split(',').map(s => BigInt(s))
  return { x, z }
}
