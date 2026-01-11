import type * as THREE from 'three'
import type { AABB } from '../collision/AABB.ts'

/**
 * Represents an entity that can be affected by physics.
 * The physics engine will update position and velocity each frame.
 */
export interface IPhysicsBody {
  /** Current position in world space (center-bottom of hitbox / feet position) */
  readonly position: THREE.Vector3

  /** Current velocity in blocks per second */
  readonly velocity: THREE.Vector3

  /** Hitbox dimensions (width, height, depth) */
  readonly hitboxSize: THREE.Vector3

  /** Whether the body is currently on the ground */
  readonly isOnGround: boolean

  /** When true, physics engine will skip this body (for flying/noclip modes) */
  skipPhysics: boolean

  /** Set the grounded state */
  setOnGround(grounded: boolean): void

  /** Get the AABB for this body at current position */
  getAABB(): AABB

  /** Get all AABBs for this body (compound hitbox for rounded collision) */
  getAABBs(): AABB[]
}
