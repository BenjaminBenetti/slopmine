import * as THREE from 'three'
import type { IPhysicsWorld } from '../interfaces/IPhysicsWorld.ts'
import type { ICollisionResult } from '../interfaces/ICollisionResult.ts'
import { AABB } from './AABB.ts'
import { EPSILON } from '../constants.ts'

/**
 * Handles collision detection and resolution between physics bodies and the world.
 * Uses a swept AABB approach with axis-by-axis resolution.
 */
export class CollisionDetector {
  constructor(private readonly world: IPhysicsWorld) {}

  /**
   * Resolve movement with collision detection.
   * Uses the "separate axes" approach for stable collision resolution.
   * Resolves Y first for proper ground detection.
   */
  resolveMovement(
    aabb: AABB,
    velocity: THREE.Vector3,
    deltaTime: number
  ): ICollisionResult {
    const result: ICollisionResult = {
      position: new THREE.Vector3(),
      velocity: velocity.clone(),
      collidedX: false,
      collidedY: false,
      collidedZ: false,
      hitGround: false,
    }

    // Calculate desired movement this frame
    const movement = velocity.clone().multiplyScalar(deltaTime)

    // Get the swept AABB region for broad-phase
    const sweptAABB = aabb.expandByVelocity(movement)

    // Query all potentially colliding blocks
    const blockAABBs = this.world.getBlockCollisions(sweptAABB)

    // Resolve each axis independently (Y first for ground detection)
    let currentAABB = aabb.clone()

    // Y-axis (most important for gravity/ground)
    const yMove = this.resolveAxis(currentAABB, movement.y, 'y', blockAABBs)
    if (Math.abs(yMove) > EPSILON) {
      currentAABB = currentAABB.translate(new THREE.Vector3(0, yMove, 0))
    }
    if (Math.abs(yMove) < Math.abs(movement.y) - EPSILON) {
      result.collidedY = true
      result.velocity.y = 0
      if (movement.y < 0) {
        result.hitGround = true
      }
    }

    // X-axis
    const xMove = this.resolveAxis(currentAABB, movement.x, 'x', blockAABBs)
    if (Math.abs(xMove) > EPSILON) {
      currentAABB = currentAABB.translate(new THREE.Vector3(xMove, 0, 0))
    }
    if (Math.abs(xMove) < Math.abs(movement.x) - EPSILON) {
      result.collidedX = true
      result.velocity.x = 0
    }

    // Z-axis
    const zMove = this.resolveAxis(currentAABB, movement.z, 'z', blockAABBs)
    if (Math.abs(zMove) > EPSILON) {
      currentAABB = currentAABB.translate(new THREE.Vector3(0, 0, zMove))
    }
    if (Math.abs(zMove) < Math.abs(movement.z) - EPSILON) {
      result.collidedZ = true
      result.velocity.z = 0
    }

    // Extract final position from AABB center-bottom
    result.position = currentAABB.getCenterBottom()

    return result
  }

  /**
   * Resolve movement along a single axis.
   * Returns the actual movement distance that can be made.
   */
  private resolveAxis(
    aabb: AABB,
    distance: number,
    axis: 'x' | 'y' | 'z',
    blockAABBs: AABB[]
  ): number {
    if (Math.abs(distance) < EPSILON) return 0

    let remaining = distance

    for (const blockAABB of blockAABBs) {
      remaining = this.clipAxis(aabb, remaining, axis, blockAABB)
      if (Math.abs(remaining) < EPSILON) break
    }

    return remaining
  }

  /**
   * Clip movement along an axis against a single block.
   */
  private clipAxis(
    aabb: AABB,
    distance: number,
    axis: 'x' | 'y' | 'z',
    block: AABB
  ): number {
    // Determine the other two axes
    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
    const otherAxes = axes.filter((a) => a !== axis) as [
      'x' | 'y' | 'z',
      'x' | 'y' | 'z',
    ]

    // Check if there's overlap on the other two axes
    const [a1, a2] = otherAxes
    if (
      aabb.max[a1] <= block.min[a1] ||
      aabb.min[a1] >= block.max[a1] ||
      aabb.max[a2] <= block.min[a2] ||
      aabb.min[a2] >= block.max[a2]
    ) {
      // No overlap on perpendicular axes, no collision possible
      return distance
    }

    // Calculate clipping distance
    if (distance > 0) {
      // Moving in positive direction
      const gap = block.min[axis] - aabb.max[axis]
      if (gap >= 0 && gap < distance) {
        return gap
      }
    } else if (distance < 0) {
      // Moving in negative direction
      const gap = block.max[axis] - aabb.min[axis]
      if (gap <= 0 && gap > distance) {
        return gap
      }
    }

    return distance
  }
}
