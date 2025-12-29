import * as THREE from 'three'
import type { IPhysicsBody } from './interfaces/IPhysicsBody.ts'
import { AABB } from './collision/AABB.ts'

/**
 * Standard physics body implementation.
 */
export class PhysicsBody implements IPhysicsBody {
  readonly position: THREE.Vector3
  readonly velocity: THREE.Vector3
  readonly hitboxSize: THREE.Vector3

  private grounded = false

  constructor(position: THREE.Vector3, hitboxSize: THREE.Vector3) {
    this.position = position.clone()
    this.velocity = new THREE.Vector3(0, 0, 0)
    this.hitboxSize = hitboxSize.clone()
  }

  get isOnGround(): boolean {
    return this.grounded
  }

  setOnGround(grounded: boolean): void {
    this.grounded = grounded
  }

  getAABB(): AABB {
    return AABB.fromCenterBottom(
      this.position,
      this.hitboxSize.x,
      this.hitboxSize.y,
      this.hitboxSize.z
    )
  }
}
