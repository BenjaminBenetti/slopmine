import type * as THREE from 'three'

/**
 * Configuration for creating a new entity.
 */
export interface IEntityConfig {
  /** Initial spawn position (world coordinates) */
  position: THREE.Vector3

  /** Initial velocity (optional, defaults to zero) */
  velocity?: THREE.Vector3

  /** Whether entity uses physics simulation */
  hasPhysics?: boolean

  /** Hitbox size for physics (required if hasPhysics is true) */
  hitboxSize?: THREE.Vector3

  /** Custom entity-specific data */
  customData?: Record<string, unknown>
}
