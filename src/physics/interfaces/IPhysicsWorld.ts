import type { AABB } from '../collision/AABB.ts'

/**
 * Interface for querying world collision data.
 * Decouples physics from WorldManager implementation.
 */
export interface IPhysicsWorld {
  /**
   * Get all solid block AABBs that intersect with the given region.
   * @param region The AABB region to query
   * @returns Array of block AABBs in world coordinates
   */
  getBlockCollisions(region: AABB): AABB[]

  /**
   * Check if a block at the given world coordinates is solid.
   */
  isSolidBlock(x: number, y: number, z: number): boolean
}
