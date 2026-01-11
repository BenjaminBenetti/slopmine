import type { IPhysicsBody } from './interfaces/IPhysicsBody.ts'
import type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
import { CollisionDetector } from './collision/CollisionDetector.ts'
import { GRAVITY, TERMINAL_VELOCITY } from './constants.ts'

export interface PhysicsEngineConfig {
  gravity?: number
  terminalVelocity?: number
}

/**
 * Main physics simulation engine.
 * Updates physics bodies each frame with gravity and collision.
 */
export class PhysicsEngine {
  private readonly gravity: number
  private readonly terminalVelocity: number
  private readonly collisionDetector: CollisionDetector
  private readonly bodies: Set<IPhysicsBody> = new Set()

  constructor(world: IPhysicsWorld, config: PhysicsEngineConfig = {}) {
    this.gravity = config.gravity ?? GRAVITY
    this.terminalVelocity = config.terminalVelocity ?? TERMINAL_VELOCITY
    this.collisionDetector = new CollisionDetector(world)
  }

  /**
   * Register a physics body to be updated.
   */
  addBody(body: IPhysicsBody): void {
    this.bodies.add(body)
  }

  /**
   * Remove a physics body from simulation.
   */
  removeBody(body: IPhysicsBody): void {
    this.bodies.delete(body)
  }

  /**
   * Update all physics bodies for this frame.
   * @param deltaTime Time elapsed in seconds
   */
  update(deltaTime: number): void {
    // Cap deltaTime to prevent physics explosion on lag spikes
    const dt = Math.min(deltaTime, 0.1)

    for (const body of this.bodies) {
      if (!body.skipPhysics) {
        this.updateBody(body, dt)
      }
    }
  }

  /**
   * Update a single physics body.
   */
  private updateBody(body: IPhysicsBody, deltaTime: number): void {
    // Apply gravity
    body.velocity.y += this.gravity * deltaTime

    // Clamp to terminal velocity
    if (body.velocity.y < this.terminalVelocity) {
      body.velocity.y = this.terminalVelocity
    }

    // Resolve collisions and get new position (using compound hitbox)
    const result = this.collisionDetector.resolveMovementMulti(
      body.getAABBs(),
      body.velocity,
      deltaTime
    )

    // Update body state
    body.position.copy(result.position)
    body.velocity.copy(result.velocity)
    body.setOnGround(result.hitGround)
  }

  /**
   * Apply a jump impulse to a body if grounded.
   * @returns true if jump was applied
   */
  applyJump(body: IPhysicsBody, jumpVelocity: number): boolean {
    if (body.isOnGround) {
      body.velocity.y = jumpVelocity
      body.setOnGround(false)
      return true
    }
    return false
  }
}
