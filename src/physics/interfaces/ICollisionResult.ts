import type * as THREE from 'three'

/**
 * Result of a collision resolution.
 */
export interface ICollisionResult {
  /** The resolved position after collision */
  position: THREE.Vector3

  /** The adjusted velocity after collision */
  velocity: THREE.Vector3

  /** Whether a collision occurred on each axis */
  collidedX: boolean
  collidedY: boolean
  collidedZ: boolean

  /** Whether the body hit the ground (downward Y collision) */
  hitGround: boolean
}
