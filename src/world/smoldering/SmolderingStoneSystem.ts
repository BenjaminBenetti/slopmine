import type { WorldManager } from '../WorldManager.ts'
import type { PhysicsBody } from '../../physics/PhysicsBody.ts'
import { BlockIds } from '../blocks/BlockIds.ts'

/** True for any lava block id (source, the 7 flow levels, and falling). */
function isLavaId(id: number): boolean {
  return (id >= BlockIds.LAVA && id <= BlockIds.LAVA_EIGHTH) || id === BlockIds.LAVA_FALLING
}
/** Max blocks to walk up through lava when finding the surface to emit from. */
const MAX_LAVA_RISE = 24

/** How often a fresh scan sweep for nearby smoldering stone begins (seconds). */
const SCAN_INTERVAL = 3.0
/**
 * Horizontal scan half-extent around the player (blocks). Wide enough that a
 * volcano's caldera smokes while it's still a distant landmark, not only once
 * the player is on its slopes — the whole point of the smoke is a far-away
 * "that mountain is active" read. The sweep is time-sliced (SLICES_PER_UPDATE)
 * so the wider radius stays cheap per frame.
 */
const SCAN_RADIUS_XZ = 96
/**
 * Vertical scan half-extent around the player (blocks). Tall: volcano rims sit
 * ~50 blocks above the surrounding terrain, so a player on the plains below
 * must still reach the caldera blocks far overhead.
 */
const SCAN_RADIUS_Y = 64
/** X-slices processed per update while a sweep is in progress (bounds cost).
 * Low so the wide/tall sweep volume stays a small per-frame slice; a full
 * sweep then spans ~48 frames (<1s), fine for ambient smoke. */
const SLICES_PER_UPDATE = 4
/** Tracked blocks farther than this from the player are dropped. */
const TRACK_DROP_RADIUS = SCAN_RADIUS_XZ + 16
/** Hard cap on tracked smoldering blocks (a caldera rim can hold dozens). */
const MAX_TRACKED = 200

/** Seconds between smoke emission cycles. */
const EMIT_INTERVAL = 1.0
/** Blocks that emit per cycle: a rotating random subset of the tracked set. */
const EMITTERS_PER_CYCLE = 32

/**
 * SmolderingStoneSystem - main-thread smoke driver for SMOLDERING_STONE.
 *
 * Same architecture as GeyserSystem: worldgen-placed blocks never receive
 * scheduled block ticks, so a NORMAL-priority task periodically sweeps a
 * modest radius around the player for SMOLDERING_STONE blocks (time-sliced,
 * SLICES_PER_UPDATE x-columns per tick) and keeps a capped tracked set.
 *
 * Every EMIT_INTERVAL seconds a random subset of tracked blocks (at most
 * EMITTERS_PER_CYCLE) emits a smoke wisp through the effect hook — a caldera
 * rim with dozens of smoldering blocks smokes from a rotating handful at a
 * time instead of all at once. Tracked blocks whose block disappears (mined,
 * chunk unloaded -> reads AIR) are dropped when they come up for emission,
 * and blocks far from the player are pruned each cycle.
 */
export class SmolderingStoneSystem {
  private readonly world: WorldManager
  private readonly playerBody: PhysicsBody

  private readonly tracked = new Map<string, { x: number; y: number; z: number }>()
  private scanTimer = SCAN_INTERVAL // first sweep starts immediately
  private sweep: ScanSweep | null = null
  private emitTimer = 0

  /** Visual effect hook (smoke wisp), called with the block-top world
   * position. Keeps this module decoupled from the renderer - wired in
   * main.ts (same pattern as GeyserSystem.setEruptionEffect). */
  private smokeEffect: ((x: number, y: number, z: number) => void) | null = null

  constructor(world: WorldManager, playerBody: PhysicsBody) {
    this.world = world
    this.playerBody = playerBody
  }

  setSmokeEffect(effect: (x: number, y: number, z: number) => void): void {
    this.smokeEffect = effect
  }

  update(deltaTime: number): void {
    this.updateScan(deltaTime)
    this.updateEmission(deltaTime)
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
          if (this.tracked.size >= MAX_TRACKED) break
          if (this.world.getBlockIdFast(x, y, z) !== BlockIds.SMOLDERING_STONE) continue

          const key = `${x},${y},${z}`
          if (this.tracked.has(key)) continue
          this.tracked.set(key, { x, y, z })
        }
      }
    }

    if (sweep.sliceIndex >= 2 * SCAN_RADIUS_XZ + 1) {
      this.sweep = null
    }
  }

  // --- Smoke emission ---------------------------------------------------

  private updateEmission(deltaTime: number): void {
    this.emitTimer += deltaTime
    if (this.emitTimer < EMIT_INTERVAL) return
    this.emitTimer = 0

    if (this.tracked.size === 0) return

    const pos = this.playerBody.position

    // Prune far-away and stale entries first (cheap: capped set size)
    for (const [key, block] of this.tracked) {
      if (
        Math.abs(pos.x - (block.x + 0.5)) > TRACK_DROP_RADIUS ||
        Math.abs(pos.z - (block.z + 0.5)) > TRACK_DROP_RADIUS
      ) {
        this.tracked.delete(key)
      }
    }

    if (this.tracked.size === 0 || this.smokeEffect === null) return

    // Rotating subset: shuffle-pick up to EMITTERS_PER_CYCLE tracked blocks
    const entries = Array.from(this.tracked.entries())
    const emitCount = Math.min(EMITTERS_PER_CYCLE, entries.length)
    for (let i = 0; i < emitCount; i++) {
      const j = i + Math.floor(Math.random() * (entries.length - i))
      const tmp = entries[i]
      entries[i] = entries[j]
      entries[j] = tmp

      const [key, block] = entries[i]
      // Drop entries whose block is gone (mined, or chunk unloaded -> AIR)
      if (this.world.getBlockIdFast(block.x, block.y, block.z) !== BlockIds.SMOLDERING_STONE) {
        this.tracked.delete(key)
        continue
      }
      this.smokeEffect(block.x + 0.5, this.emitY(block.x, block.y, block.z), block.z + 0.5)
    }
  }

  /**
   * World Y to emit a wisp from. Volcano smoldering stone paves the caldera
   * floor UNDER the lava, so if lava sits directly above the block we walk up
   * to the lava surface and emit just above it — the plume then appears to
   * pour off the lava lake. For any other smoldering block (none today, but
   * keeps the module general) we emit from the block top.
   */
  private emitY(x: number, y: number, z: number): number {
    if (!isLavaId(this.world.getBlockIdFast(x, y + 1, z))) return y + 1
    let surfaceY = y + 1
    for (let steps = 0; steps < MAX_LAVA_RISE; steps++) {
      if (!isLavaId(this.world.getBlockIdFast(x, surfaceY + 1, z))) break
      surfaceY++
    }
    // First cell above the lava top, so smoke starts at the surface
    return surfaceY + 1
  }
}

/** In-progress scan sweep, anchored where the player stood when it started. */
interface ScanSweep {
  originX: number
  originY: number
  originZ: number
  /** Next x offset to process, in [0, 2 * SCAN_RADIUS_XZ]. */
  sliceIndex: number
}
