import * as THREE from 'three'
import type { IPhysicsWorld } from '../interfaces/IPhysicsWorld.ts'
import type { ICollisionResult } from '../interfaces/ICollisionResult.ts'
import { AABB } from './AABB.ts'
import { EPSILON, STEP_HEIGHT } from '../constants.ts'

/**
 * Handles collision detection and resolution between physics bodies and the world.
 * Uses a swept AABB approach with axis-by-axis resolution.
 */
export class CollisionDetector {
  // Pre-allocated to avoid per-frame GC pressure
  private readonly tempOffset = new THREE.Vector3()
  private readonly tempMovement = new THREE.Vector3()
  private readonly tempCombinedMin = new THREE.Vector3()
  private readonly tempCombinedMax = new THREE.Vector3()
  // Pre-allocated AABBs for broad-phase
  private readonly combinedAABB = new AABB(new THREE.Vector3(), new THREE.Vector3())
  private readonly sweptAABB = new AABB(new THREE.Vector3(), new THREE.Vector3())
  // Pre-allocated AABB array for currentAABBs - resized as needed
  private currentAABBsPool: AABB[] = []
  // Scratch AABBs for the auto step-up retry - resized as needed
  private stepAABBsPool: AABB[] = []
  // Pre-allocated collision result to avoid per-frame GC pressure
  private readonly collisionResult: ICollisionResult = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    collidedX: false,
    collidedY: false,
    collidedZ: false,
    hitGround: false,
  }

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
    // Reset pre-allocated result
    const result = this.collisionResult
    result.position.set(0, 0, 0)
    result.velocity.copy(velocity)
    result.collidedX = false
    result.collidedY = false
    result.collidedZ = false
    result.hitGround = false

    if (aabbs.length === 0) {
      return result
    }

    // Calculate desired movement this frame using pre-allocated vector
    this.tempMovement.copy(velocity).multiplyScalar(deltaTime)

    // Get the swept AABB region for broad-phase using pre-allocated AABBs
    this.combinedAABB.min.copy(aabbs[0].min)
    this.combinedAABB.max.copy(aabbs[0].max)
    for (const aabb of aabbs) {
      this.combinedAABB.min.min(aabb.min)
      this.combinedAABB.max.max(aabb.max)
    }
    // Expand by velocity in-place into sweptAABB
    this.sweptAABB.min.copy(this.combinedAABB.min)
    this.sweptAABB.max.copy(this.combinedAABB.max)
    if (this.tempMovement.x < 0) this.sweptAABB.min.x += this.tempMovement.x
    else this.sweptAABB.max.x += this.tempMovement.x
    if (this.tempMovement.y < 0) this.sweptAABB.min.y += this.tempMovement.y
    else this.sweptAABB.max.y += this.tempMovement.y
    if (this.tempMovement.z < 0) this.sweptAABB.min.z += this.tempMovement.z
    else this.sweptAABB.max.z += this.tempMovement.z
    // Auto step-up retries the horizontal movement from up to STEP_HEIGHT
    // higher; include that region in the broad-phase (the block AABB pool is
    // reused, so a second query mid-resolution would invalidate results)
    if (Math.abs(this.tempMovement.x) > EPSILON || Math.abs(this.tempMovement.z) > EPSILON) {
      this.sweptAABB.max.y += STEP_HEIGHT
    }

    // Query all potentially colliding blocks
    const blockAABBs = this.world.getBlockCollisions(this.sweptAABB)

    // Track current position of all AABBs - reuse pool to avoid allocation
    while (this.currentAABBsPool.length < aabbs.length) {
      this.currentAABBsPool.push(new AABB(new THREE.Vector3(), new THREE.Vector3()))
    }
    // Use pool directly with length tracking instead of slice() which allocates
    const currentAABBsLength = aabbs.length
    for (let i = 0; i < currentAABBsLength; i++) {
      this.currentAABBsPool[i].min.copy(aabbs[i].min)
      this.currentAABBsPool[i].max.copy(aabbs[i].max)
    }

    // Y-axis (most important for gravity/ground)
    const yMove = this.resolveAxisMultiPooled(currentAABBsLength, this.tempMovement.y, 'y', blockAABBs)
    if (Math.abs(yMove) > EPSILON) {
      this.tempOffset.set(0, yMove, 0)
      for (let i = 0; i < currentAABBsLength; i++) {
        this.currentAABBsPool[i].translateInPlace(this.tempOffset)
      }
    }
    if (Math.abs(yMove) < Math.abs(this.tempMovement.y) - EPSILON) {
      result.collidedY = true
      result.velocity.y = 0
      if (this.tempMovement.y < 0) {
        result.hitGround = true
      }
    }

    // X-axis
    const xMove = this.resolveAxisMultiPooled(currentAABBsLength, this.tempMovement.x, 'x', blockAABBs)
    if (Math.abs(xMove) > EPSILON) {
      this.tempOffset.set(xMove, 0, 0)
      for (let i = 0; i < currentAABBsLength; i++) {
        this.currentAABBsPool[i].translateInPlace(this.tempOffset)
      }
    }
    if (Math.abs(xMove) < Math.abs(this.tempMovement.x) - EPSILON) {
      result.collidedX = true
      result.velocity.x = 0
    }

    // Z-axis
    const zMove = this.resolveAxisMultiPooled(currentAABBsLength, this.tempMovement.z, 'z', blockAABBs)
    if (Math.abs(zMove) > EPSILON) {
      this.tempOffset.set(0, 0, zMove)
      for (let i = 0; i < currentAABBsLength; i++) {
        this.currentAABBsPool[i].translateInPlace(this.tempOffset)
      }
    }
    if (Math.abs(zMove) < Math.abs(this.tempMovement.z) - EPSILON) {
      result.collidedZ = true
      result.velocity.z = 0
    }

    // Auto step-up: walking on the ground into a low ledge (slab, stair)
    // retries the horizontal movement from up to STEP_HEIGHT higher and
    // settles onto the step - no jump needed. hitGround is only true while
    // gravity is being clipped by the floor, so this never fires mid-air.
    if (
      result.hitGround &&
      (result.collidedX || result.collidedZ) &&
      (Math.abs(this.tempMovement.x) > EPSILON || Math.abs(this.tempMovement.z) > EPSILON)
    ) {
      this.tryStepUp(aabbs, currentAABBsLength, yMove, xMove, zMove, velocity, blockAABBs, result)
    }

    // Extract final position from first AABB center-bottom (into pre-allocated vector)
    this.currentAABBsPool[0].getCenterBottomInto(result.position)

    return result
  }

  /**
   * Attempt to step up onto a low ledge instead of being blocked by it.
   * Starting from the post-gravity position: lift by up to STEP_HEIGHT
   * (ceiling-checked), retry the full horizontal movement, then settle back
   * down onto the step surface. The stepped position is accepted only when
   * it gains real horizontal progress AND lands on a raised surface;
   * otherwise the original (blocked) result stands.
   */
  private tryStepUp(
    originalAABBs: AABB[],
    count: number,
    yMove: number,
    xMove: number,
    zMove: number,
    velocity: THREE.Vector3,
    blockAABBs: AABB[],
    result: ICollisionResult
  ): void {
    // Scratch AABBs at the post-gravity, pre-horizontal position
    while (this.stepAABBsPool.length < count) {
      this.stepAABBsPool.push(new AABB(new THREE.Vector3(), new THREE.Vector3()))
    }
    for (let i = 0; i < count; i++) {
      this.stepAABBsPool[i].min.copy(originalAABBs[i].min)
      this.stepAABBsPool[i].max.copy(originalAABBs[i].max)
    }
    this.tempOffset.set(0, yMove, 0)
    for (let i = 0; i < count; i++) {
      this.stepAABBsPool[i].translateInPlace(this.tempOffset)
    }

    // Lift as far as the ceiling allows, up to STEP_HEIGHT
    const upMove = this.resolveAxisOnPool(this.stepAABBsPool, count, STEP_HEIGHT, 'y', blockAABBs)
    if (upMove < 2 * EPSILON) return
    this.tempOffset.set(0, upMove, 0)
    for (let i = 0; i < count; i++) {
      this.stepAABBsPool[i].translateInPlace(this.tempOffset)
    }

    // Retry the full horizontal movement from the lifted position
    const xMove2 = this.resolveAxisOnPool(this.stepAABBsPool, count, this.tempMovement.x, 'x', blockAABBs)
    if (Math.abs(xMove2) > EPSILON) {
      this.tempOffset.set(xMove2, 0, 0)
      for (let i = 0; i < count; i++) {
        this.stepAABBsPool[i].translateInPlace(this.tempOffset)
      }
    }
    const zMove2 = this.resolveAxisOnPool(this.stepAABBsPool, count, this.tempMovement.z, 'z', blockAABBs)
    if (Math.abs(zMove2) > EPSILON) {
      this.tempOffset.set(0, 0, zMove2)
      for (let i = 0; i < count; i++) {
        this.stepAABBsPool[i].translateInPlace(this.tempOffset)
      }
    }

    // Must gain horizontal progress over the blocked attempt
    const blockedProgress = Math.abs(xMove) + Math.abs(zMove)
    const steppedProgress = Math.abs(xMove2) + Math.abs(zMove2)
    if (steppedProgress <= blockedProgress + EPSILON) return

    // Settle back down onto the step surface
    const downMove = this.resolveAxisOnPool(this.stepAABBsPool, count, -upMove, 'y', blockAABBs)
    const netRise = upMove + downMove
    // Reject if nothing was actually stepped onto (came all the way back
    // down) or the rise somehow exceeds the step limit
    if (netRise <= EPSILON || netRise > STEP_HEIGHT + EPSILON) return
    this.tempOffset.set(0, downMove, 0)
    for (let i = 0; i < count; i++) {
      this.stepAABBsPool[i].translateInPlace(this.tempOffset)
    }

    // Accept: replace the resolved AABBs and update the result for the
    // retried axes. The body stands on the step, so it stays grounded.
    for (let i = 0; i < count; i++) {
      this.currentAABBsPool[i].min.copy(this.stepAABBsPool[i].min)
      this.currentAABBsPool[i].max.copy(this.stepAABBsPool[i].max)
    }
    result.collidedX = Math.abs(xMove2) < Math.abs(this.tempMovement.x) - EPSILON
    result.collidedZ = Math.abs(zMove2) < Math.abs(this.tempMovement.z) - EPSILON
    result.velocity.x = result.collidedX ? 0 : velocity.x
    result.velocity.z = result.collidedZ ? 0 : velocity.z
    result.velocity.y = 0
    result.hitGround = true
  }

  /**
   * Resolve movement along a single axis for an explicit AABB pool.
   */
  private resolveAxisOnPool(
    pool: AABB[],
    count: number,
    distance: number,
    axis: 'x' | 'y' | 'z',
    blockAABBs: AABB[]
  ): number {
    if (Math.abs(distance) < EPSILON) return 0

    let minMove = distance
    for (let i = 0; i < count; i++) {
      const move = this.resolveAxis(pool[i], distance, axis, blockAABBs)
      if (distance > 0) {
        minMove = Math.min(minMove, move)
      } else {
        minMove = Math.max(minMove, move)
      }
    }
    return minMove
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
   * Resolve movement using the pre-allocated AABB pool (avoids array allocation).
   */
  private resolveAxisMultiPooled(
    count: number,
    distance: number,
    axis: 'x' | 'y' | 'z',
    blockAABBs: AABB[]
  ): number {
    if (Math.abs(distance) < EPSILON) return 0

    let minMove = distance

    // Check each player AABB from pool and take the most restrictive result
    for (let i = 0; i < count; i++) {
      const move = this.resolveAxis(this.currentAABBsPool[i], distance, axis, blockAABBs)
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
    // Determine the other two axes (inline to avoid filter allocation)
    let a1: 'x' | 'y' | 'z'
    let a2: 'x' | 'y' | 'z'
    if (axis === 'x') {
      a1 = 'y'
      a2 = 'z'
    } else if (axis === 'y') {
      a1 = 'x'
      a2 = 'z'
    } else {
      a1 = 'x'
      a2 = 'y'
    }

    // Check if there's overlap on the other two axes
    // Use strict inequality (<, >) to handle edge-touching cases correctly
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
