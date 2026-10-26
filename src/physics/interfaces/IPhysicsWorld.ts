import type * as THREE from 'three'
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

  /**
   * Check if a block at the given world coordinates is climbable.
   * Climbable blocks have the CLIMBABLE tag (ladders, vines, etc).
   */
  isClimbableBlock(x: number, y: number, z: number): boolean

  /**
   * How high water stands in a block (0 = none, 1 = the whole cell; a
   * partial level stands level/8 high). Water and swamp water - not lava.
   */
  getWaterFill?(x: number, y: number, z: number): number

  /** The water's current in a block (blocks/s, world axes) into `out` (zero where it is still). */
  getWaterCurrent?(x: number, y: number, z: number, out: THREE.Vector3): void
}
