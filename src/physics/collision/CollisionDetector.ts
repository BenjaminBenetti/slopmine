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
   * Resolve movement with collision detection for a single AABB.
   * Uses the "separate axes" approach for stable collision resolution.
   * Resolves Y first for proper ground detection.
   */
  resolveMovement(
    aabb: AABB,
    velocity: THREE.Vector3,
    deltaTime: number
  ): ICollisionResult {
    return this.resolveMovementMulti([aabb], velocity, deltaTime)
  }

  /**
   * Resolve movement with collision detection for multiple AABBs (compound hitbox).
   * Checks all hitbox AABBs and uses the most restrictive collision result.
   */
  resolveMovementMulti(
    aabbs: AABB[],
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

    if (aabbs.length === 0) {
      return result
    }

    // Calculate desired movement this frame
    const movement = velocity.clone().multiplyScalar(deltaTime)

    // Get the swept AABB region for broad-phase (use first AABB expanded to cover all)
    let combinedMin = aabbs[0].min.clone()
    let combinedMax = aabbs[0].max.clone()
    for (const aabb of aabbs) {
      combinedMin.min(aabb.min)
      combinedMax.max(aabb.max)
    }
    const combinedAABB = new AABB(combinedMin, combinedMax)
    const sweptAABB = combinedAABB.expandByVelocity(movement)

    // Query all potentially colliding blocks
    const blockAABBs = this.world.getBlockCollisions(sweptAABB)

    // Track current position of all AABBs
    let currentAABBs = aabbs.map((a) => a.clone())

    // Y-axis (most important for gravity/ground)
    const yMove = this.resolveAxisMulti(currentAABBs, movement.y, 'y', blockAABBs)
    if (Math.abs(yMove) > EPSILON) {
      const offset = new THREE.Vector3(0, yMove, 0)
      currentAABBs = currentAABBs.map((a) => a.translate(offset))
    }
    if (Math.abs(yMove) < Math.abs(movement.y) - EPSILON) {
      result.collidedY = true
      result.velocity.y = 0
      if (movement.y < 0) {
        result.hitGround = true
      }
    }

    // X-axis
    const xMove = this.resolveAxisMulti(currentAABBs, movement.x, 'x', blockAABBs)
    if (Math.abs(xMove) > EPSILON) {
      const offset = new THREE.Vector3(xMove, 0, 0)
      currentAABBs = currentAABBs.map((a) => a.translate(offset))
    }
    if (Math.abs(xMove) < Math.abs(movement.x) - EPSILON) {
      result.collidedX = true
      result.velocity.x = 0
    }

    // Z-axis
    const zMove = this.resolveAxisMulti(currentAABBs, movement.z, 'z', blockAABBs)
    if (Math.abs(zMove) > EPSILON) {
      const offset = new THREE.Vector3(0, 0, zMove)
      currentAABBs = currentAABBs.map((a) => a.translate(offset))
    }
    if (Math.abs(zMove) < Math.abs(movement.z) - EPSILON) {
      result.collidedZ = true
      result.velocity.z = 0
    }

    // Extract final position from first AABB center-bottom
    result.position = currentAABBs[0].getCenterBottom()

    return result
  }

  /**
   * Resolve movement along a single axis for multiple AABBs.
   * Returns the minimum movement allowed across all AABBs.
   */
  private resolveAxisMulti(
    aabbs: AABB[],
    distance: number,
    axis: 'x' | 'y' | 'z',
    blockAABBs: AABB[]
  ): number {
    if (Math.abs(distance) < EPSILON) return 0

    let minMove = distance

    // Check each player AABB and take the most restrictive result
    for (const aabb of aabbs) {
      const move = this.resolveAxis(aabb, distance, axis, blockAABBs)
      // Take the smallest magnitude movement (most restrictive)
      if (distance > 0) {
        minMove = Math.min(minMove, move)
      } else {
        minMove = Math.max(minMove, move)
      }
    }

    return minMove
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
    // Use strict inequality (<, >) to handle edge-touching cases correctly
    const [a1, a2] = otherAxes
    if (
      aabb.max[a1] < block.min[a1] ||
      aabb.min[a1] > block.max[a1] ||
      aabb.max[a2] < block.min[a2] ||
      aabb.min[a2] > block.max[a2]
    ) {
      // No overlap on perpendicular axes, no collision possible
      return distance
    }

    // Calculate clipping distance
    if (distance > 0) {
      // Moving in positive direction
      const gap = block.min[axis] - aabb.max[axis]
      if (gap < 0) {
        // Player's right edge is past block's left edge
        // Check if actually overlapping (not completely past the block)
        if (aabb.min[axis] < block.max[axis]) {
          // Overlapping - stop movement to prevent further penetration
          // Player can still escape by moving in the opposite direction
          return 0
        }
        // Completely past block, no collision
        return distance
      }
      if (gap < distance) {
        // Apply epsilon margin to prevent floating point precision issues
        return Math.max(0, gap - EPSILON)
      }
    } else if (distance < 0) {
      // Moving in negative direction
      const gap = block.max[axis] - aabb.min[axis]
      if (gap > 0) {
        // Block's right edge is past player's left edge
        // Check if actually overlapping (not completely past the block)
        if (aabb.max[axis] > block.min[axis]) {
          // Overlapping - stop movement to prevent further penetration
          // Player can still escape by moving in the opposite direction
          return 0
        }
        // Completely past block, no collision
        return distance
      }
      if (gap > distance) {
        // Apply epsilon margin to prevent floating point precision issues
        return Math.min(0, gap + EPSILON)
      }
    }

    return distance
  }
}
