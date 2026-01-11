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
  skipPhysics = false

  // Pre-allocated AABBs for getAABBs() to avoid per-frame GC pressure
  private readonly aabbsCache: AABB[] = []

  constructor(position: THREE.Vector3, hitboxSize: THREE.Vector3) {
    this.position = position.clone()
    this.velocity = new THREE.Vector3(0, 0, 0)
    this.hitboxSize = hitboxSize.clone()

    // Pre-allocate the compound hitbox AABBs
    this.aabbsCache = [
      new AABB(new THREE.Vector3(), new THREE.Vector3()),
      new AABB(new THREE.Vector3(), new THREE.Vector3()),
    ]
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

  /**
   * Get compound hitbox as multiple AABBs forming a cross/plus shape.
   * This approximates a rounded collision shape without sharp corners.
   * Returns a cached array to avoid per-frame allocations.
   */
  getAABBs(): AABB[] {
    const pos = this.position
    const w = this.hitboxSize.x
    const h = this.hitboxSize.y
    const d = this.hitboxSize.z

    // Shrink amount for corners (removes ~25% from each corner)
    const shrink = Math.min(w, d) * 0.25

    // X-aligned box: full width, reduced depth
    const halfW = w / 2
    const reducedD = d - shrink * 2
    const halfReducedD = reducedD / 2
    this.aabbsCache[0].min.set(pos.x - halfW, pos.y, pos.z - halfReducedD)
    this.aabbsCache[0].max.set(pos.x + halfW, pos.y + h, pos.z + halfReducedD)

    // Z-aligned box: reduced width, full depth
    const reducedW = w - shrink * 2
    const halfReducedW = reducedW / 2
    const halfD = d / 2
    this.aabbsCache[1].min.set(pos.x - halfReducedW, pos.y, pos.z - halfD)
    this.aabbsCache[1].max.set(pos.x + halfReducedW, pos.y + h, pos.z + halfD)

    return this.aabbsCache
  }
}
