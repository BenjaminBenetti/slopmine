import { BlockIds } from '../world/blocks/BlockIds.ts'

/**
 * All block IDs that count as lava for environmental damage purposes:
 * the full source block, the 7 partial flow levels, and falling lava.
 */
const LAVA_BLOCK_IDS: ReadonlySet<number> = new Set<number>([
  BlockIds.LAVA,
  BlockIds.LAVA_SEVEN_EIGHTH,
  BlockIds.LAVA_THREE_QUARTER,
  BlockIds.LAVA_FIVE_EIGHTH,
  BlockIds.LAVA_HALF,
  BlockIds.LAVA_THREE_EIGHTH,
  BlockIds.LAVA_QUARTER,
  BlockIds.LAVA_EIGHTH,
  BlockIds.LAVA_FALLING,
])

/** Block IDs that hurt the player while standing on top of them. */
const HOT_FLOOR_BLOCK_IDS: ReadonlySet<number> = new Set<number>([
  BlockIds.MAGMA,
  BlockIds.HELL_MAGMA,
])

/** Lava contact: 8 HP/s, applied in half-second ticks (first tick immediate). */
const LAVA_DAMAGE_PER_SECOND = 8
const LAVA_TICK_INTERVAL = 0.5
const LAVA_DAMAGE_PER_TICK = LAVA_DAMAGE_PER_SECOND * LAVA_TICK_INTERVAL

/** Burning DoT after leaving lava: 2 HP every 1s for 4s (4 ticks total). */
const BURN_TICK_COUNT = 4
const BURN_TICK_INTERVAL = 1.0
const BURN_DAMAGE_PER_TICK = 2

/** Hot floor (magma): 2 HP per full second of continuous standing. */
const HOT_FLOOR_TICK_INTERVAL = 1.0
const HOT_FLOOR_DAMAGE_PER_TICK = 2

/** Inset applied to the body AABB so exact block-boundary contact doesn't count. */
const AABB_EPSILON = 0.001

/** How far below the feet to sample for the supporting (stood-on) block. */
const FLOOR_PROBE_DEPTH = 0.1

/** Minimal world surface needed: numeric fast-path block ID lookup. */
export interface IBlockIdSource {
  getBlockIdFast(x: number, y: number, z: number): number
}

/** Minimal physics body surface needed (PhysicsBody satisfies this). */
export interface IBodyState {
  readonly position: { x: number; y: number; z: number }
  readonly hitboxSize: { x: number; y: number; z: number }
  readonly isOnGround: boolean
}

/**
 * Environmental damage: lava contact, post-lava burning DoT, and hot
 * magma floors. Self-contained — takes the world, the player body, and a
 * damage callback; owns its own damage cadence so it is independent of
 * melee invincibility frames.
 *
 * Call update(dt) once per frame after physics.
 */
export class EnvironmentalDamage {
  private readonly world: IBlockIdSource
  private readonly body: IBodyState
  private readonly applyDamage: (amount: number) => void

  private inLava = false
  private lavaTickAccumulator = 0

  private burnTicksRemaining = 0
  private burnTickAccumulator = 0

  private hotFloorAccumulator = 0

  constructor(
    world: IBlockIdSource,
    body: IBodyState,
    applyDamage: (amount: number) => void
  ) {
    this.world = world
    this.body = body
    this.applyDamage = applyDamage
  }

  /** True while the player's body overlaps any lava block. */
  get isInLava(): boolean {
    return this.inLava
  }

  /** True while the post-lava burning DoT is active (not while in lava). */
  get isBurning(): boolean {
    return this.burnTicksRemaining > 0
  }

  /** True while the burn vignette should be shown (in lava or burning). */
  get showBurnEffect(): boolean {
    return this.inLava || this.isBurning
  }

  update(deltaTime: number): void {
    const wasInLava = this.inLava
    this.inLava = this.isBodyInLava()

    if (this.inLava) {
      // Direct lava damage: immediate tick on entry, then every interval.
      if (!wasInLava) {
        this.lavaTickAccumulator = 0
        this.applyDamage(LAVA_DAMAGE_PER_TICK)
      } else {
        this.lavaTickAccumulator += deltaTime
        while (this.lavaTickAccumulator >= LAVA_TICK_INTERVAL) {
          this.lavaTickAccumulator -= LAVA_TICK_INTERVAL
          this.applyDamage(LAVA_DAMAGE_PER_TICK)
        }
      }

      // Keep the burning status primed; it starts counting down on exit.
      this.burnTicksRemaining = BURN_TICK_COUNT
      this.burnTickAccumulator = 0
    } else {
      this.lavaTickAccumulator = 0

      // Burning DoT after leaving lava.
      if (this.burnTicksRemaining > 0) {
        this.burnTickAccumulator += deltaTime
        while (
          this.burnTickAccumulator >= BURN_TICK_INTERVAL &&
          this.burnTicksRemaining > 0
        ) {
          this.burnTickAccumulator -= BURN_TICK_INTERVAL
          this.burnTicksRemaining--
          this.applyDamage(BURN_DAMAGE_PER_TICK)
        }
      }
    }

    // Hot floor damage (magma). Lava contact takes precedence, and standing
    // on magma never ignites burning — it is a separate periodic tick that
    // only fires after a full interval of continuous grounded contact, so
    // hopping across magma avoids it.
    if (!this.inLava && this.body.isOnGround && this.isStandingOnHotFloor()) {
      this.hotFloorAccumulator += deltaTime
      while (this.hotFloorAccumulator >= HOT_FLOOR_TICK_INTERVAL) {
        this.hotFloorAccumulator -= HOT_FLOOR_TICK_INTERVAL
        this.applyDamage(HOT_FLOOR_DAMAGE_PER_TICK)
      }
    } else {
      this.hotFloorAccumulator = 0
    }
  }

  /** Clear all environmental state (call on respawn/teleport). */
  reset(): void {
    this.inLava = false
    this.lavaTickAccumulator = 0
    this.burnTicksRemaining = 0
    this.burnTickAccumulator = 0
    this.hotFloorAccumulator = 0
  }

  /**
   * Check whether any block cell overlapped by the full player AABB
   * (feet through head) is lava. Position is the bottom-center of the body.
   */
  private isBodyInLava(): boolean {
    const pos = this.body.position
    const halfW = this.body.hitboxSize.x / 2 - AABB_EPSILON
    const halfD = this.body.hitboxSize.z / 2 - AABB_EPSILON
    const height = this.body.hitboxSize.y

    const minX = Math.floor(pos.x - halfW)
    const maxX = Math.floor(pos.x + halfW)
    const minY = Math.floor(pos.y + AABB_EPSILON)
    const maxY = Math.floor(pos.y + height - AABB_EPSILON)
    const minZ = Math.floor(pos.z - halfD)
    const maxZ = Math.floor(pos.z + halfD)

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (LAVA_BLOCK_IDS.has(this.world.getBlockIdFast(x, y, z))) {
            return true
          }
        }
      }
    }
    return false
  }

  /**
   * Check whether any block directly beneath the player's footprint is a
   * hot floor block (magma).
   */
  private isStandingOnHotFloor(): boolean {
    const pos = this.body.position
    const halfW = this.body.hitboxSize.x / 2 - AABB_EPSILON
    const halfD = this.body.hitboxSize.z / 2 - AABB_EPSILON
    const probeY = pos.y - FLOOR_PROBE_DEPTH

    const minX = Math.floor(pos.x - halfW)
    const maxX = Math.floor(pos.x + halfW)
    const minZ = Math.floor(pos.z - halfD)
    const maxZ = Math.floor(pos.z + halfD)

    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (HOT_FLOOR_BLOCK_IDS.has(this.world.getBlockIdFast(x, probeY, z))) {
          return true
        }
      }
    }
    return false
  }
}
