import type { DungeonLayout } from '../../DungeonTypes.ts'

/**
 * Shared dimensions of the Infernal Bastion's outer works (curtain wall,
 * towers, gate, causeway) - used by the passes and the gate-route planner.
 */

/** Open bailey between the outermost modules and the curtain wall. */
export const BAILEY_RING = 4
/** Curtain wall: two blocks thick, walk at base + WALL_H. */
export const WALL_T = 2
export const WALL_H = 8
/** Corner towers: (2·TOWER_R + 1)² footprint, top at base + TOWER_TOP. */
export const TOWER_R = 3
export const TOWER_TOP = 15
/** Half width of the gate gap and the causeway. */
export const GATE_HALF = 2
/** Longest causeway / approach out of the gate (blocks beyond the outer wall plane). */
export const ROUTE_MAX = 40
/**
 * Everything the passes draw beyond the module boxes (the kit's
 * exteriorMargin): the bailey, the wall, and the longest route out of it.
 */
export const BASTION_EXTERIOR_MARGIN = BAILEY_RING + WALL_T + ROUTE_MAX + 1

export interface Rect {
  readonly x0: number
  readonly z0: number
  readonly x1: number
  readonly z1: number
}

/** The curtain wall's outer rectangle: every module's box, plus the bailey ring and the wall. */
export function enclosure(layout: DungeonLayout | { modules: DungeonLayout['modules'] }): Rect {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const m of layout.modules) {
    x0 = Math.min(x0, m.box.x0)
    z0 = Math.min(z0, m.box.z0)
    x1 = Math.max(x1, m.box.x1)
    z1 = Math.max(z1, m.box.z1)
  }
  const out = BAILEY_RING + WALL_T
  return { x0: x0 - out, z0: z0 - out, x1: x1 + out, z1: z1 + out }
}
