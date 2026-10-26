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

  /** When true, physics engine will skip gravity (for climbing ladders/vines) */
  isClimbing: boolean

  /** Share of the body's height under water (0-1), measured by the engine every step */
  submerged: number

  /** World Y of the water surface at the body (NaN out of water), measured with `submerged` */
  waterSurfaceY: number

  /**
   * How deep the body floats: the share of it under water where buoyancy
   * balances gravity (deeper, it rises; shallower, it settles). 0 = sinks.
   */
  buoyancy: number

  /**
   * Horizontal speed multiplier the engine applies to the body's own velocity
   * while it swims (more than 30% under water). 1 = the body's controller
   * handles swimming itself (the player).
   */
  swimSpeedFactor: number

  /** Set the grounded state */
  setOnGround(grounded: boolean): void

  /** Get the AABB for this body at current position */
  getAABB(): AABB

  /** Get all AABBs for this body (compound hitbox for rounded collision) */
  getAABBs(): AABB[]
}
