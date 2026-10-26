import type * as THREE from 'three'
import type { IBlockProperties } from '../interfaces/IBlock.ts'
import { Hydrology, WATER_SURFACE_Y } from '../generate/water/Hydrology.ts'

/** What the currents read of the world (WorldManager). */
export interface WaterCurrentsWorld {
  getBlockFast(x: number, y: number, z: number): { readonly properties: IBlockProperties }
}

/** Falling water (waterfalls, spills) pulls straight down. */
const FALLING_SPEED = 3.5
/** Flowing (not source) water runs downhill along its levels at up to this speed. */
const FLOW_SPEED = 2.2
/** A river's current fades out this many blocks below its surface. */
const RIVER_CURRENT_DEPTH = 10
const RIVER_CACHE_LIMIT = 8192

interface RiverFlow {
  readonly x: number
  readonly z: number
  readonly speed: number
}
const STILL: RiverFlow = { x: 0, z: 0, speed: 0 }
const direction = { x: 0, z: 0 }

/**
 * The current of the water in a block, for physics (swimmers, mobs, drops
 * and boats are carried by it) and anything else that wants to follow the
 * flow. Main thread.
 * - Falling water pulls down.
 * - Flowing water (levels below a source) runs toward lower levels and open
 *   cells next to it, as the liquid simulation spreads it.
 * - Still water in a river or stream channel runs along it toward the sea,
 *   fastest at the surface (Hydrology.flowAt, cached per column).
 */
export class WaterCurrents {
  private readonly hydrology: Hydrology
  private readonly rivers = new Map<number, RiverFlow>()

  constructor(private readonly world: WaterCurrentsWorld, seed: number) {
    this.hydrology = Hydrology.forSeed(seed)
  }

  /** The current in block (x, y, z), blocks/s on world axes, into `out`. */
  currentAt(x: number, y: number, z: number, out: THREE.Vector3): void {
    out.set(0, 0, 0)
    const props = this.world.getBlockFast(x, y, z).properties
    const family = props.isLiquid ? props.liquidFamily : props.submergedIn
    if (!family || family === 'lava') return
    if (props.isFallingLiquid) {
      out.y = -FALLING_SPEED
      return
    }
    const level = props.isLiquid ? (props.liquidLevel ?? 8) : 8
    if (level < 8) {
      this.spread(x, y, z, family, level, out)
      return
    }
    // Still water: a river's current, near its surface
    if (y > WATER_SURFACE_Y || y < WATER_SURFACE_Y - RIVER_CURRENT_DEPTH) return
    const flow = this.riverAt(x, z)
    if (flow.speed <= 0) return
    const depthFade = 1 - (WATER_SURFACE_Y - y) / RIVER_CURRENT_DEPTH
    out.x = flow.x * flow.speed * depthFade
    out.z = flow.z * flow.speed * depthFade
  }

  /** Flowing water: toward each lower (or open) neighbour, weighted by the drop. */
  private spread(x: number, y: number, z: number, family: string, level: number, out: THREE.Vector3): void {
    let fx = 0
    let fz = 0
    for (let side = 0; side < 4; side++) {
      const dx = side === 0 ? 1 : side === 1 ? -1 : 0
      const dz = side === 2 ? 1 : side === 3 ? -1 : 0
      const n = this.world.getBlockFast(x + dx, y, z + dz).properties
      let drop = 0
      if (n.isLiquid && n.liquidFamily === family) {
        // Water pouring down next door draws hardest
        drop = n.isFallingLiquid ? level : level - (n.liquidLevel ?? 8)
      } else if (!n.isSolid && !n.isLiquid && n.submergedIn === undefined) {
        // (a plant standing in water is a full source: no drop toward it)
        drop = level * 0.5
      }
      if (drop > 0) {
        fx += dx * drop
        fz += dz * drop
      }
    }
    const length = Math.hypot(fx, fz)
    if (length < 1e-6) return
    const speed = FLOW_SPEED * (0.55 + 0.45 * (1 - level / 8))
    out.x = (fx / length) * speed
    out.z = (fz / length) * speed
  }

  private riverAt(x: number, z: number): RiverFlow {
    const key = (x + 0x80000) * 0x100000 + (z + 0x80000)
    let flow = this.rivers.get(key)
    if (flow) return flow
    const speed = this.hydrology.flowAt(x + 0.5, z + 0.5, direction)
    flow = speed > 0 ? { x: direction.x, z: direction.z, speed } : STILL
    if (this.rivers.size >= RIVER_CACHE_LIMIT) this.rivers.clear()
    this.rivers.set(key, flow)
    return flow
  }
}
