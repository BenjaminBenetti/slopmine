import type { IPhysicsBody } from './interfaces/IPhysicsBody.ts'
import type { IPhysicsWorld } from './interfaces/IPhysicsWorld.ts'
import { CollisionDetector } from './collision/CollisionDetector.ts'
import { GRAVITY, TERMINAL_VELOCITY } from './constants.ts'

export interface PhysicsEngineConfig {
  gravity?: number
  terminalVelocity?: number
}

/**
 * Simulation LOD tier for a body. Mirrors EntityManager's AI update tiers so a
 * distant idle mob is stepped less often. Tier 0 = full 60 UPS, 1 = 30 UPS,
 * 2 = 15 UPS. The player body is always forced to tier 0.
 */
const TIER_INTERVALS = [0, 1 / 30, 1 / 15]

/** Cap per-step dt to prevent physics explosion on lag spikes / large catch-up. */
const MAX_STEP_DT = 0.1

/**
 * A grounded body whose velocity is below this (blocks/s, all axes) is put to
 * sleep and skips collision resolution until woken. AI writes any non-zero
 * velocity to wake it (see update()).
 */
const SLEEP_VELOCITY_EPSILON = 0.01

/**
 * While asleep, re-probe the support block under a body every this many of its
 * own steps and wake if the ground is gone. Conservative substitute for an
 * event-driven block-change notification (see followUps).
 */
const SUPPORT_PROBE_INTERVAL = 15

/**
 * Per-body scheduling + sleep bookkeeping. Kept engine-side (not on the body)
 * so IPhysicsBody stays a plain data contract.
 */
interface BodySimState {
  /** LOD tier (0/1/2); set by EntityManager via setBodyTier. */
  tier: number
  /** Real dt accumulated since this body's last simulated step. */
  accumulator: number
  /** True when the body is grounded + idle and skipping simulation. */
  asleep: boolean
  /** Steps taken since the last support probe while asleep. */
  probeCounter: number
  /** Player body: always tier 0, never sleeps. */
  noSleep: boolean
}

/**
 * Main physics simulation engine.
 * Updates physics bodies each frame with gravity and collision.
 *
 * Bodies are distance-tiered (stepped at 60/30/15 UPS via EntityManager-supplied
 * tiers with accumulated dt) and sleep when grounded and idle, so far-away or
 * stationary entities cost almost nothing. The player body always full-sims.
 */
export class PhysicsEngine {
  private readonly gravity: number
  private readonly terminalVelocity: number
  private readonly collisionDetector: CollisionDetector
  private readonly world: IPhysicsWorld
  private readonly bodies: Set<IPhysicsBody> = new Set()
  private readonly simStates: Map<IPhysicsBody, BodySimState> = new Map()

  constructor(world: IPhysicsWorld, config: PhysicsEngineConfig = {}) {
    this.gravity = config.gravity ?? GRAVITY
    this.terminalVelocity = config.terminalVelocity ?? TERMINAL_VELOCITY
    this.collisionDetector = new CollisionDetector(world)
    this.world = world
  }

  /**
   * Register a physics body to be updated.
   */
  addBody(body: IPhysicsBody): void {
    this.bodies.add(body)
    if (!this.simStates.has(body)) {
      this.simStates.set(body, {
        tier: 0,
        accumulator: 0,
        asleep: false,
        probeCounter: 0,
        noSleep: false,
      })
    }
  }

  /**
   * Remove a physics body from simulation.
   */
  removeBody(body: IPhysicsBody): void {
    this.bodies.delete(body)
    this.simStates.delete(body)
  }

  /**
   * Mark a body as the player: always simulated at full rate and never slept.
   * Idempotent; safe to call before or after addBody.
   */
  setPlayerBody(body: IPhysicsBody): void {
    let state = this.simStates.get(body)
    if (state === undefined) {
      this.addBody(body)
      state = this.simStates.get(body)!
    }
    state.noSleep = true
    state.tier = 0
    state.asleep = false
  }

  /**
   * Set the simulation LOD tier for a body (0/1/2). Called by EntityManager
   * with the same distance tier it already computes for AI updates, so the
   * distance is not recomputed here. No-op for unregistered bodies.
   */
  setBodyTier(body: IPhysicsBody, tier: number): void {
    const state = this.simStates.get(body)
    if (state !== undefined && !state.noSleep) {
      state.tier = tier
    }
  }

  /**
   * Update all physics bodies for this frame.
   * @param deltaTime Time elapsed in seconds
   */
  update(deltaTime: number): void {
    for (const body of this.bodies) {
      if (body.skipPhysics) {
        // Skipped bodies (flying/noclip) do not integrate; drop any queued time
        // so re-enabling doesn't produce a catch-up jump.
        const s = this.simStates.get(body)
        if (s !== undefined) s.accumulator = 0
        continue
      }

      const state = this.simStates.get(body)
      if (state === undefined) {
        // Body registered without a state (shouldn't happen); fall back to
        // full-rate simulation to preserve behavior.
        this.updateBody(body, Math.min(deltaTime, MAX_STEP_DT))
        continue
      }

      // Distance tiering: accumulate real dt and only step when this body's
      // interval is reached, passing the accumulated dt so integration stays
      // consistent across skipped frames.
      const tier = state.noSleep ? 0 : state.tier
      state.accumulator += deltaTime
      if (state.accumulator < TIER_INTERVALS[tier]) {
        continue
      }
      const stepDt = Math.min(state.accumulator, MAX_STEP_DT)
      state.accumulator = 0

      // Sleep handling: a slept body skips gravity + collision entirely until
      // woken by a velocity write (AI/knockback/impulse) or loss of support.
      if (state.asleep) {
        if (this.isVelocityAboveEpsilon(body)) {
          state.asleep = false
        } else {
          state.probeCounter++
          if (state.probeCounter >= SUPPORT_PROBE_INTERVAL) {
            state.probeCounter = 0
            if (!this.hasSupportBelow(body)) {
              state.asleep = false
            }
          }
          if (state.asleep) {
            continue
          }
        }
      }

      this.updateBody(body, stepDt)

      // Fall asleep once grounded and idle (never for the player body).
      if (!state.noSleep && body.isOnGround && !this.isVelocityAboveEpsilon(body)) {
        state.asleep = true
        state.probeCounter = 0
        body.velocity.set(0, 0, 0)
      }
    }
  }

  /**
   * Update a single physics body.
   */
  private updateBody(body: IPhysicsBody, deltaTime: number): void {
    // Apply gravity (skip when climbing to allow staying in place)
    if (!body.isClimbing) {
      body.velocity.y += this.gravity * deltaTime

      // Clamp to terminal velocity
      if (body.velocity.y < this.terminalVelocity) {
        body.velocity.y = this.terminalVelocity
      }
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
   * True if any velocity component exceeds the sleep threshold.
   */
  private isVelocityAboveEpsilon(body: IPhysicsBody): boolean {
    const v = body.velocity
    return (
      v.x > SLEEP_VELOCITY_EPSILON || v.x < -SLEEP_VELOCITY_EPSILON ||
      v.y > SLEEP_VELOCITY_EPSILON || v.y < -SLEEP_VELOCITY_EPSILON ||
      v.z > SLEEP_VELOCITY_EPSILON || v.z < -SLEEP_VELOCITY_EPSILON
    )
  }

  /**
   * Probe the block directly under a body's feet. Used to wake a sleeping body
   * when the ground it was resting on is removed. Uses the numeric fast-path
   * isSolidBlock (no BigInt / string-key allocation).
   */
  private hasSupportBelow(body: IPhysicsBody): boolean {
    const p = body.position
    return this.world.isSolidBlock(
      Math.floor(p.x),
      Math.floor(p.y - 0.05),
      Math.floor(p.z)
    )
  }

  /**
   * Apply a jump impulse to a body if grounded.
   * @returns true if jump was applied
   */
  applyJump(body: IPhysicsBody, jumpVelocity: number): boolean {
    if (body.isOnGround) {
      body.velocity.y = jumpVelocity
      body.setOnGround(false)
      const state = this.simStates.get(body)
      if (state !== undefined) state.asleep = false
      return true
    }
    return false
  }
}
