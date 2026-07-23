import type { WorldManager } from '../WorldManager.ts'
import type { PhysicsBody } from '../../physics/PhysicsBody.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

/** How often a fresh scan sweep for nearby geysers begins (seconds). */
const SCAN_INTERVAL = 2.0
/** Horizontal scan half-extent around the player (blocks). */
const SCAN_RADIUS_XZ = 24
/** Vertical scan half-extent around the player's feet (blocks). */
const SCAN_RADIUS_Y = 16
/** X-slices processed per update while a sweep is in progress (bounds cost). */
const SLICES_PER_UPDATE = 8
/** Tracked geysers farther than this from the player are dropped. */
const TRACK_DROP_RADIUS = SCAN_RADIUS_XZ + 16

/** Seconds of bright GEYSER_ACTIVE warning before the blast. */
const WARNING_DURATION = 1.2
/** Seconds the upward blast stays live. */
const BURST_DURATION = 0.8
/** Idle time between eruptions (seconds, uniform random). */
const MIN_IDLE = 8
const MAX_IDLE = 20

/** Vent blast column: this many blocks above the vent block. */
const VENT_HEIGHT = 7
/** Horizontal tolerance from the vent center (blocks). */
const VENT_RADIUS = 1.5
/** Upward launch velocity (blocks/s). JUMP_VELOCITY is 9 — this flings well higher. */
const LAUNCH_VELOCITY = 16
/** Damage dealt once per eruption to a player caught in the blast. */
const ERUPTION_DAMAGE = 4

type GeyserPhase = 'idle' | 'warning' | 'burst'

interface TrackedGeyser {
  readonly x: number
  readonly y: number
  readonly z: number
  phase: GeyserPhase
  /** Seconds remaining in the current phase. */
  timer: number
  /** Player already damaged during the current eruption. */
  damaged: boolean
}

/** In-progress scan sweep, anchored where the player stood when it started. */
interface ScanSweep {
  originX: number
  originY: number
  originZ: number
  /** Next x offset to process, in [0, 2 * SCAN_RADIUS_XZ]. */
  sliceIndex: number
}

/**
 * GeyserSystem - main-thread eruption driver for GEYSER vent blocks.
 *
 * Worldgen-placed blocks never receive scheduled block ticks (worldgen writes
 * bypass setBlock side effects), so a scheduled-tick geyser would sleep
 * forever. Instead this NORMAL-priority task periodically sweeps a modest
 * radius around the player for GEYSER blocks and runs an eruption state
 * machine per found vent:
 *
 *   idle (8-20s) -> warning (1.2s, block swaps to bright GEYSER_ACTIVE)
 *   -> burst (0.8s, players in the vent column are launched upward and take
 *   light damage once) -> revert to GEYSER, back to idle.
 *
 * Sweeps are sliced across updates (SLICES_PER_UPDATE x-columns per tick) so
 * no single frame pays for the whole volume. Vents whose block disappears
 * (mined, chunk unloaded -> reads AIR) are dropped, and every block swap
 * verifies the current block first so player edits are never overwritten.
 */
export class GeyserSystem {
  private readonly world: WorldManager
  private readonly playerBody: PhysicsBody
  private readonly onPlayerDamaged: (amount: number) => void

  private readonly geysers = new Map<string, TrackedGeyser>()
  private scanTimer = SCAN_INTERVAL // first sweep starts immediately
  private sweep: ScanSweep | null = null

  /** Optional visual effect hook (particle puff), called at burst start with
   * the vent-top world position. Keeps this module decoupled from the
   * renderer - wired in main.ts (same pattern as WorldManager.setDropSpawner). */
  private eruptionEffect: ((x: number, y: number, z: number) => void) | null = null

  constructor(
    world: WorldManager,
    playerBody: PhysicsBody,
    onPlayerDamaged: (amount: number) => void
  ) {
    this.world = world
    this.playerBody = playerBody
    this.onPlayerDamaged = onPlayerDamaged
  }

  setEruptionEffect(effect: (x: number, y: number, z: number) => void): void {
    this.eruptionEffect = effect
  }

  update(deltaTime: number): void {
    this.updateScan(deltaTime)
    this.updateGeysers(deltaTime)
  }

  // --- Scanning ---------------------------------------------------------

  private updateScan(deltaTime: number): void {
    if (this.sweep === null) {
      this.scanTimer += deltaTime
      if (this.scanTimer < SCAN_INTERVAL) return
      this.scanTimer = 0
      const pos = this.playerBody.position
      this.sweep = {
        originX: Math.floor(pos.x),
        originY: Math.floor(pos.y),
        originZ: Math.floor(pos.z),
        sliceIndex: 0,
      }
    }

    const sweep = this.sweep
    const minY = Math.max(0, sweep.originY - SCAN_RADIUS_Y)
    const maxY = sweep.originY + SCAN_RADIUS_Y
    const lastSlice = Math.min(sweep.sliceIndex + SLICES_PER_UPDATE, 2 * SCAN_RADIUS_XZ + 1)

    for (; sweep.sliceIndex < lastSlice; sweep.sliceIndex++) {
      const x = sweep.originX - SCAN_RADIUS_XZ + sweep.sliceIndex
      for (let z = sweep.originZ - SCAN_RADIUS_XZ; z <= sweep.originZ + SCAN_RADIUS_XZ; z++) {
        for (let y = minY; y <= maxY; y++) {
          const blockId = this.world.getBlockIdFast(x, y, z)
          if (blockId !== BlockIds.GEYSER && blockId !== BlockIds.GEYSER_ACTIVE) continue

          const key = `${x},${y},${z}`
          if (this.geysers.has(key)) continue

          // Untracked GEYSER_ACTIVE (e.g. restored from a save that captured a
          // mid-eruption swap): adopt it and put the vent back to dormant.
          if (blockId === BlockIds.GEYSER_ACTIVE) {
            this.world.setBlock(BigInt(x), BigInt(y), BigInt(z), BlockIds.GEYSER)
          }

          this.geysers.set(key, {
            x, y, z,
            phase: 'idle',
            timer: this.randomIdleTime(),
            damaged: false,
          })
        }
      }
    }

    if (sweep.sliceIndex >= 2 * SCAN_RADIUS_XZ + 1) {
      this.sweep = null
    }
  }

  // --- Eruption state machine -------------------------------------------

  private updateGeysers(deltaTime: number): void {
    if (this.geysers.size === 0) return

    const pos = this.playerBody.position

    for (const [key, geyser] of this.geysers) {
      // Drop far-away vents; revert first if we left them mid-eruption
      const dx = pos.x - (geyser.x + 0.5)
      const dz = pos.z - (geyser.z + 0.5)
      if (Math.abs(dx) > TRACK_DROP_RADIUS || Math.abs(dz) > TRACK_DROP_RADIUS) {
        if (geyser.phase !== 'idle') this.revertBlock(geyser)
        this.geysers.delete(key)
        continue
      }

      geyser.timer -= deltaTime

      switch (geyser.phase) {
        case 'idle':
          if (geyser.timer <= 0) {
            // Verify the vent still exists (mined, or chunk unloaded -> AIR)
            if (this.blockAt(geyser) !== BlockIds.GEYSER) {
              this.geysers.delete(key)
              break
            }
            this.world.setBlock(
              BigInt(geyser.x), BigInt(geyser.y), BigInt(geyser.z),
              BlockIds.GEYSER_ACTIVE
            )
            geyser.phase = 'warning'
            geyser.timer = WARNING_DURATION
          }
          break

        case 'warning':
          if (geyser.timer <= 0) {
            if (this.blockAt(geyser) !== BlockIds.GEYSER_ACTIVE) {
              // Player mined the erupting vent (or chunk unloaded)
              this.geysers.delete(key)
              break
            }
            geyser.phase = 'burst'
            geyser.timer = BURST_DURATION
            geyser.damaged = false
            this.eruptionEffect?.(geyser.x + 0.5, geyser.y + 1, geyser.z + 0.5)
          }
          break

        case 'burst': {
          if (this.blockAt(geyser) !== BlockIds.GEYSER_ACTIVE) {
            this.geysers.delete(key)
            break
          }

          // Player feet inside the vent column? (1x1 column above the vent,
          // with a little horizontal tolerance)
          const dy = pos.y - geyser.y
          if (
            Math.abs(dx) <= VENT_RADIUS &&
            Math.abs(dz) <= VENT_RADIUS &&
            dy > -0.5 && dy < VENT_HEIGHT
          ) {
            // Sustained jet: keep the player at launch speed through the burst
            if (this.playerBody.velocity.y < LAUNCH_VELOCITY) {
              this.playerBody.velocity.y = LAUNCH_VELOCITY
            }
            if (!geyser.damaged) {
              geyser.damaged = true
              this.onPlayerDamaged(ERUPTION_DAMAGE)
            }
          }

          if (geyser.timer <= 0) {
            this.revertBlock(geyser)
            geyser.phase = 'idle'
            geyser.timer = this.randomIdleTime()
            geyser.damaged = false
          }
          break
        }
      }
    }
  }

  // --- Helpers ----------------------------------------------------------

  private blockAt(geyser: TrackedGeyser): number {
    return this.world.getBlockIdFast(geyser.x, geyser.y, geyser.z)
  }

  /** Put the vent back to dormant, but never overwrite anything else. */
  private revertBlock(geyser: TrackedGeyser): void {
    if (this.blockAt(geyser) === BlockIds.GEYSER_ACTIVE) {
      this.world.setBlock(
        BigInt(geyser.x), BigInt(geyser.y), BigInt(geyser.z),
        BlockIds.GEYSER
      )
    }
  }

  private randomIdleTime(): number {
    return MIN_IDLE + Math.random() * (MAX_IDLE - MIN_IDLE)
  }
}
