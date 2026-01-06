import * as THREE from 'three'

/**
 * Axis-Aligned Bounding Box for collision detection.
 */
export class AABB {
  constructor(
    public min: THREE.Vector3,
    public max: THREE.Vector3
  ) {}

  /**
   * Create AABB from center-bottom position (feet) and dimensions.
   */
  static fromCenterBottom(
    position: THREE.Vector3,
    width: number,
    height: number,
    depth: number
  ): AABB {
    const halfWidth = width / 2
    const halfDepth = depth / 2
    return new AABB(
      new THREE.Vector3(
        position.x - halfWidth,
        position.y,
        position.z - halfDepth
      ),
      new THREE.Vector3(
        position.x + halfWidth,
        position.y + height,
        position.z + halfDepth
      )
    )
  }

  /**
   * Create AABB for a block at world coordinates.
   * Blocks occupy the full unit cube from (x,y,z) to (x+1,y+1,z+1).
   */
  static forBlock(x: number, y: number, z: number): AABB {
    return new AABB(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + 1, y + 1, z + 1)
    )
  }

  /**
   * Check if this AABB intersects another.
   */
  intersects(other: AABB): boolean {
    return (
      this.max.x > other.min.x &&
      this.min.x < other.max.x &&
      this.max.y > other.min.y &&
      this.min.y < other.max.y &&
      this.max.z > other.min.z &&
      this.min.z < other.max.z
    )
  }

  /**
   * Expand this AABB by velocity to get the swept region.
   * Used for broad-phase collision detection.
   */
  expandByVelocity(velocity: THREE.Vector3): AABB {
    const newMin = this.min.clone()
    const newMax = this.max.clone()

    if (velocity.x < 0) newMin.x += velocity.x
    else newMax.x += velocity.x

    if (velocity.y < 0) newMin.y += velocity.y
    else newMax.y += velocity.y

    if (velocity.z < 0) newMin.z += velocity.z
    else newMax.z += velocity.z

    return new AABB(newMin, newMax)
  }

  /**
   * Clone this AABB.
   */
  clone(): AABB {
    return new AABB(this.min.clone(), this.max.clone())
  }

  /**
   * Translate this AABB by an offset, returning a new AABB.
   */
  translate(offset: THREE.Vector3): AABB {
    return new AABB(
      this.min.clone().add(offset),
      this.max.clone().add(offset)
    )
  }

  /**
   * Translate this AABB in place (mutates this instance).
   */
  translateInPlace(offset: THREE.Vector3): this {
    this.min.add(offset)
    this.max.add(offset)
    return this
  }

  /**
   * Get the center-bottom position (feet position) of this AABB.
   */
  getCenterBottom(): THREE.Vector3 {
    return new THREE.Vector3(
      (this.min.x + this.max.x) / 2,
      this.min.y,
      (this.min.z + this.max.z) / 2
    )
  }

  /**
   * Get the center-bottom position into an existing vector (avoids allocation).
   */
  getCenterBottomInto(target: THREE.Vector3): THREE.Vector3 {
    target.set(
      (this.min.x + this.max.x) / 2,
      this.min.y,
      (this.min.z + this.max.z) / 2
    )
    return target
  }
}
