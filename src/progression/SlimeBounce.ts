import type { PhysicsBody } from '../physics/PhysicsBody.ts'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import { PLAYER_WIDTH, PLAYER_DEPTH } from '../physics/constants.ts'
import { registerDamageModifier } from '../player/DamageModifiers.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'

/**
 * Slime blocks: landing on one cancels fall damage, and a real fall (not a
 * hop) bounces the player back up with part of the impact speed - a landing
 * pad for drop shafts.
 */

/** Minimum downward speed (blocks/s) that bounces: about a 1.6-block fall */
const BOUNCE_MIN_SPEED = 9.5
/** Fraction of the impact speed returned upward */
const BOUNCE_RESTITUTION = 0.6
/** Cap on the bounce speed (~6 blocks high) */
const BOUNCE_MAX_SPEED = 18

export interface SlimeBounceOptions {
  scheduler: TaskScheduler
  playerBody: PhysicsBody
  /** Numeric block id lookup (WorldManager.getBlockIdFast) */
  getBlockId(x: number, y: number, z: number): number
  /** No bounce while flying / noclip */
  isPhysicsActive(): boolean
}

export function setupSlimeBounce(options: SlimeBounceOptions): void {
  const { playerBody, getBlockId } = options
  const halfW = PLAYER_WIDTH / 2 - 0.05
  const halfD = PLAYER_DEPTH / 2 - 0.05

  /** Any block under the player's feet (footprint corners) is slime. */
  const isStandingOnSlime = (): boolean => {
    const p = playerBody.position
    const y = Math.floor(p.y - 0.05)
    for (const dx of [-halfW, halfW]) {
      for (const dz of [-halfD, halfD]) {
        if (getBlockId(Math.floor(p.x + dx), y, Math.floor(p.z + dz)) === BlockIds.SLIME) return true
      }
    }
    return false
  }

  // Fall damage runs in the CRITICAL 'player-health' task right after the
  // landing physics step, while the feet still touch the block
  registerDamageModifier((amount, source) => {
    if (source !== 'fall' || amount <= 0) return amount
    return playerBody.isOnGround && isStandingOnSlime() ? 0 : amount
  })

  let airborneVelocityY = 0
  options.scheduler.createTask({
    id: 'slime-bounce',
    priority: TaskPriority.CRITICAL,
    update: () => {
      if (!options.isPhysicsActive()) {
        airborneVelocityY = 0
        return
      }
      if (!playerBody.isOnGround) {
        airborneVelocityY = playerBody.velocity.y
        return
      }
      const impact = -airborneVelocityY
      airborneVelocityY = 0
      if (impact >= BOUNCE_MIN_SPEED && isStandingOnSlime()) {
        playerBody.velocity.y = Math.min(impact * BOUNCE_RESTITUTION, BOUNCE_MAX_SPEED)
      }
    },
  })
}
