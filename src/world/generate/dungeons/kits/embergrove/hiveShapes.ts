import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { Face, type BlockSpec, type Box, type DrawTarget, type ModuleContext } from '../../DungeonTypes.ts'
import { doorways, room } from '../../DungeonBuild.ts'

/**
 * Organic building helpers for the Sporeheart Hive kit: rooms and bores on
 * the regular cell skeleton, dressed with irregular, position-hashed detail
 * (rounded corners, coves, root ribs, wall bulges, tendrils). Everything is a
 * pure function of the module context (seam-safe).
 */

export const CS = 9
export const FH = 7

const AIR = BlockIds.AIR
export const isAir = (id: number): boolean => id === AIR

/** Door protection zones: open horizontal doorways grown 2 blocks around (dressing never blocks a way in). */
export function doorZones(ctx: ModuleContext): Box[] {
  const zones: Box[] = []
  for (const c of ctx.connectors) {
    if (!c.open) continue
    const b = ctx.doorwayBox(c)
    zones.push({ x0: b.x0 - 2, y0: b.y0 - 1, z0: b.z0 - 2, x1: b.x1 + 2, y1: b.y1 + 1, z1: b.z1 + 2 })
  }
  return zones
}

export function inZones(zones: readonly Box[], x: number, y: number, z: number): boolean {
  for (const b of zones) {
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1) return true
  }
  return false
}

export interface HiveRoomOptions {
  readonly wall: BlockSpec
  readonly floor?: BlockSpec
  readonly ceiling?: BlockSpec
  readonly frame?: BlockSpec
  /** One tall hall instead of a floor per level. */
  readonly tall?: boolean
  /** Root ribs every 4 blocks along the walls (default 'rib'; null: none). */
  readonly ribs?: BlockSpec | null
  /** Chance a wall-side cell bulges inward (default 0.1). */
  readonly bulge?: number
  /** Chance per ceiling cell of hanging tendrils (default 0.03). */
  readonly tendrils?: number
}

/**
 * A hive room: the framework shell (walls, floors, doorways for open
 * connectors) with rounded vertical corners, a cove under the ceiling,
 * root ribs, bulges and hanging tendrils. Returns the door zones.
 */
export function hiveRoom(ctx: ModuleContext, o: HiveRoomOptions): Box[] {
  const { w, h, d } = ctx
  room(ctx, {
    wall: o.wall,
    floor: o.floor ?? 'floor',
    ceiling: o.ceiling ?? o.wall,
    doorFrame: o.frame,
    interiorFloors: !o.tall,
  })
  const zones = doorZones(ctx)
  const spans: Array<[number, number]> = []
  if (o.tall) spans.push([0, h - 1])
  else for (let k = 0; k * FH < h; k++) spans.push([k * FH, Math.min(h - 1, (k + 1) * FH)])
  const ribs = o.ribs === undefined ? 'rib' : o.ribs
  const bulge = o.bulge ?? 0.1
  const tendrils = o.tendrils ?? 0.03

  for (const [yb, yt] of spans) {
    // Rounded vertical corners
    for (const [x, z] of [[1, 1], [w - 2, 1], [1, d - 2], [w - 2, d - 2]] as const) {
      for (let y = yb + 1; y < yt; y++) if (!inZones(zones, x, y, z)) ctx.set(x, y, z, o.wall)
    }
    // Cove under the ceiling: an irregular ring one block in from the walls
    for (let x = 1; x < w - 1; x++) {
      for (const z of [1, d - 2]) if (ctx.hash(x, yt - 1, z, 11) < 0.75 && !inZones(zones, x, yt - 1, z)) ctx.set(x, yt - 1, z, o.wall)
    }
    for (let z = 2; z < d - 2; z++) {
      for (const x of [1, w - 2]) if (ctx.hash(x, yt - 1, z, 12) < 0.75 && !inZones(zones, x, yt - 1, z)) ctx.set(x, yt - 1, z, o.wall)
    }
    // Root ribs along the walls
    if (ribs !== null) {
      for (let x = 3; x < w - 3; x += 4) {
        for (const z of [1, d - 2]) {
          if (inZones(zones, x, yb + 2, z)) continue
          ctx.fill(x, yb + 1, z, x, yt - 1, z, ribs)
        }
      }
      for (let z = 3; z < d - 3; z += 4) {
        for (const x of [1, w - 2]) {
          if (inZones(zones, x, yb + 2, z)) continue
          ctx.fill(x, yb + 1, z, x, yt - 1, z, ribs)
        }
      }
    }
    // Bulges: wall-side cells swell inward
    for (let y = yb + 1; y < yt - 1; y++) {
      for (let x = 2; x < w - 2; x++) {
        for (const z of [1, d - 2]) {
          if (ctx.hash(x, y, z, 13) < bulge && !inZones(zones, x, y, z)) ctx.set(x, y, z, o.wall)
        }
      }
      for (let z = 2; z < d - 2; z++) {
        for (const x of [1, w - 2]) {
          if (ctx.hash(x, y, z, 14) < bulge && !inZones(zones, x, y, z)) ctx.set(x, y, z, o.wall)
        }
      }
    }
    // Hanging tendrils from the ceiling
    if (tendrils > 0) {
      for (let x = 2; x < w - 2; x++) {
        for (let z = 2; z < d - 2; z++) {
          if (ctx.hash(x, yt, z, 15) >= tendrils) continue
          const len = 1 + Math.floor(ctx.hash(x, yt, z, 16) * 3)
          for (let i = 1; i <= len; i++) ctx.setIf(x, yt - i, z, BlockIds.HANGING_TENDRILS, isAir)
        }
      }
    }
  }
  return zones
}

/** Elliptic bore cross-section test (lat: offset from the axis, y: height above the floor). */
function inBore(lat: number, y: number): number {
  const a = lat / 2.5
  const b = (y - 3) / 2.5
  return a * a + b * b
}

/**
 * A root tunnel through a single cell: fill the cell with root mass and carve
 * an elliptic bore from the cell centre to every OPEN horizontal connector
 * (a 5-wide, 5-tall tube - the 3×4 doorway sits inside it), with root ribs
 * narrowing it every few blocks, a mycelium floor and hanging tendrils.
 */
export function rootBore(ctx: ModuleContext, mass: BlockSpec = 'mass'): void {
  const { w, d } = ctx
  const c = 4
  ctx.fill(0, 0, 0, w - 1, ctx.h - 1, d - 1, mass)
  const arms: Face[] = []
  for (const conn of ctx.connectors) if (conn.open && conn.face < 4) arms.push(conn.face)
  // Centre chamber (slightly wider than the bore)
  for (let y = 1; y <= 5; y++) {
    for (let x = 1; x <= 7; x++) {
      for (let z = 1; z <= 7; z++) {
        const dx = (x - c) / 3, dz = (z - c) / 3, dy = (y - 3) / 2.6
        if (dx * dx + dz * dz + dy * dy <= 1) ctx.set(x, y, z, AIR)
      }
    }
  }
  for (const face of arms) {
    for (let along = 0; along <= 4; along++) {
      for (let lat = -2; lat <= 2; lat++) {
        for (let y = 1; y <= 5; y++) {
          const e = inBore(lat, y)
          if (e > 1) continue
          const [x, z] = armCell(face, along, lat, c, w, d)
          // Ribs: one ring per arm, two blocks from the centre
          if (along === 2 && e > 0.62) ctx.set(x, y, z, 'rib')
          else ctx.set(x, y, z, AIR)
        }
      }
    }
  }
  // Mycelium floor under the open bore, bulges and tendrils
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      ctx.setIf(x, 0, z, 'floor', (id) => id !== AIR) // floor everywhere under the cell
      if (ctx.hash(x, 5, z, 21) < 0.06) {
        const len = 1 + Math.floor(ctx.hash(x, 5, z, 22) * 2)
        for (let i = 0; i < len; i++) ctx.setIf(x, 5 - i, z, BlockIds.HANGING_TENDRILS, isAir)
      }
    }
  }
  // Re-open the doorways (ribs or tendrils must never block one)
  doorways(ctx)
}

/** Module-local cell of a bore arm: `along` 0 = centre .. 4 = the face, `lat` across. */
function armCell(face: Face, along: number, lat: number, c: number, w: number, d: number): [number, number] {
  switch (face) {
    case Face.North: return [c + lat, c - along]
    case Face.South: return [c + lat, Math.min(d - 1, c + along)]
    case Face.East: return [Math.min(w - 1, c + along), c + lat]
    default: return [c - along, c + lat]
  }
}

/** A cluster of egg pods on the floor around (x, z) (setIf air, so walls stay). */
export function podCluster(t: DrawTarget, x: number, y: number, z: number, radius: number, chance: number, salt: number): void {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius + 0.5) continue
      if (t.hash(x + dx, y, z + dz, salt) < chance) t.setIf(x + dx, y, z + dz, BlockIds.EGG_POD_CLUSTER, isAir)
    }
  }
}

/**
 * A ceiling lamp: hangs a glow bulb under the ceiling at (x, yCeil - 1, z)
 * (the light marker records it).
 */
export function ceilingLamp(ctx: ModuleContext, x: number, yCeil: number, z: number): void {
  ctx.light(x, yCeil - 1, z)
}
