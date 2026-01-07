import type { IWorldCoordinate } from '../../interfaces/ICoordinates.ts'

/**
 * Base interface for per-block runtime state.
 * Stored separately from block instances (which are stateless flyweights).
 *
 * Used for blocks that need persistent data like:
 * - Forges (ore/fuel/output inventory)
 * - Chests (item storage)
 * - Signs (text content)
 */
export interface IBlockState {
  /** World position of this block state */
  readonly position: IWorldCoordinate

  /** Called when the block is broken - cleanup resources, drop items */
  onDestroy?(): void

  /** Serialize state for persistence (future feature) */
  serialize?(): unknown

  /** Deserialize state from saved data (future feature) */
  deserialize?(data: unknown): void
}

/**
 * Create a unique key string for a world coordinate.
 */
export function createBlockStateKey(coord: IWorldCoordinate): string {
  return `${coord.x},${coord.y},${coord.z}`
}

/**
 * Parse a block state key back to coordinates.
 */
export function parseBlockStateKey(key: string): IWorldCoordinate {
  const [x, y, z] = key.split(',').map((s) => BigInt(s))
  return { x, y, z }
}
