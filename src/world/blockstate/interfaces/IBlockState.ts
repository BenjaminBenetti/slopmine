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

  /**
   * Unique type identifier for deserializer dispatch.
   * Each block state class must have a unique stateType string.
   * Example: 'forge', 'apothecary_workbench', 'chest'
   */
  readonly stateType: string

  /** Called when the block is broken - cleanup resources, drop items */
  onDestroy?(): void

  /**
   * Check if this state has meaningful data to persist.
   * Returns true if any inventory slots have items or processing is in progress.
   * Used to skip saving empty block states.
   */
  hasData(): boolean

  /**
   * Serialize state to a plain object for persistence.
   * Returns undefined if there's nothing to serialize.
   */
  serialize(): unknown | undefined

  /**
   * Restore state from saved data.
   * Called after the block state is created to populate it with saved data.
   */
  deserialize(data: unknown): void
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
