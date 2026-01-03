/**
 * Interfaces for pathfinding system.
 */

/**
 * A position in 3D space for pathfinding.
 * Uses numbers instead of BigInt for simplicity in pathfinding calculations.
 */
export interface PathfindingPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Result of a pathfinding request.
 */
export interface PathfindingResult {
  /** Whether a path was found */
  success: boolean
  /** The path from start to goal (empty if no path found) */
  path: PathfindingPosition[]
  /** Cost of the path (0 if no path found) */
  cost: number
  /** Number of nodes explored during search */
  nodesExplored: number
}

/**
 * Configuration for pathfinding behavior.
 */
export interface PathfindingConfig {
  /** Maximum distance to search (Manhattan distance) */
  maxDistance?: number
  /** Maximum number of nodes to explore before giving up */
  maxNodes?: number
  /** Whether diagonal movement is allowed */
  allowDiagonals?: boolean
  /** Maximum Y difference for a single step (jump height) */
  maxStepHeight?: number
  /** Maximum Y fall distance */
  maxFallDistance?: number
}
