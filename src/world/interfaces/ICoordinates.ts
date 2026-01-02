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

/**
 * Sub-chunk coordinates including vertical index.
 * Each chunk column has 16 sub-chunks stacked vertically (0-15).
 */
export interface ISubChunkCoordinate {
  readonly x: bigint
  readonly z: bigint
  readonly subY: number // 0-15
}

/**
 * Sub-chunk key for Map-based storage.
 * Format: "x,z,subY" as string.
 */
export type SubChunkKey = string

/**
 * Create a sub-chunk key from coordinates.
 */
export function createSubChunkKey(x: bigint, z: bigint, subY: number): SubChunkKey {
  return `${x},${z},${subY}`
}

/**
 * Parse a sub-chunk key back to coordinates.
 */
export function parseSubChunkKey(key: SubChunkKey): ISubChunkCoordinate {
  const parts = key.split(',')
  return {
    x: BigInt(parts[0]),
    z: BigInt(parts[1]),
    subY: parseInt(parts[2], 10),
  }
}

/**
 * Convert a sub-chunk coordinate to a chunk coordinate (column).
 */
export function subChunkToChunk(subCoord: ISubChunkCoordinate): IChunkCoordinate {
  return { x: subCoord.x, z: subCoord.z }
}

/**
 * Convert world Y coordinate to sub-chunk Y index (0-15).
 */
export function worldYToSubChunkY(worldY: number): number {
  return Math.floor(worldY / 64)
}

/**
 * Convert world Y coordinate to local Y within a sub-chunk (0-63).
 */
export function worldYToLocalY(worldY: number): number {
  return worldY % 64
}
