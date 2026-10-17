import { BlockIds } from '../../blocks/BlockIds.ts'
import { BlockFacing } from '../../blocks/BlockFacing.ts'
import { Face, FACE_DIR, type BlockSpec, type Box, type DrawTarget, type ModuleConnector, type ModuleContext } from './DungeonTypes.ts'

/**
 * Build primitives for dungeon kits. Every function draws through a
 * DrawTarget - module-local for builders (rotation is the writer's job),
 * world for passes - and is a pure function of its arguments, so it is
 * seam-safe: call it the same way in every sub-chunk, never skip work based
 * on what got written. Boxes are inclusive.
 */

const isAir = (id: number): boolean => id === BlockIds.AIR

/** Is the cell air or a liquid/foliage-like soft block that structures may overwrite? (AIR only by default.) */
export const AIR_ONLY = isAir

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

/** Fill a box. */
export function fillBox(t: DrawTarget, b: Box, block: BlockSpec, meta?: number): void {
  t.fill(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, block, meta)
}

/** Air-fill a box (carving through terrain for underground modules). */
export function carve(t: DrawTarget, b: Box): void {
  t.fill(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, BlockIds.AIR)
}

/** A shell of `shell` around an interior of `interior` (default air). */
export function hollowBox(t: DrawTarget, b: Box, shell: BlockSpec, interior: BlockSpec = BlockIds.AIR): void {
  t.fill(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, shell)
  if (b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= 2 && b.z1 - b.z0 >= 2) {
    t.fill(b.x0 + 1, b.y0 + 1, b.z0 + 1, b.x1 - 1, b.y1 - 1, b.z1 - 1, interior)
  }
}

/** The four vertical walls of a box (no floor or ceiling). */
export function walls(t: DrawTarget, b: Box, block: BlockSpec): void {
  t.fill(b.x0, b.y0, b.z0, b.x1, b.y1, b.z0, block)
  t.fill(b.x0, b.y0, b.z1, b.x1, b.y1, b.z1, block)
  t.fill(b.x0, b.y0, b.z0, b.x0, b.y1, b.z1, block)
  t.fill(b.x1, b.y0, b.z0, b.x1, b.y1, b.z1, block)
}

/** A horizontal slab at height y. */
export function slab(t: DrawTarget, x0: number, z0: number, x1: number, z1: number, y: number, block: BlockSpec): void {
  t.fill(x0, y, z0, x1, y, z1, block)
}

/** Set `block` at each cell of the box with probability `chance` (position-hashed), where `test` allows. */
export function sprinkle(
  t: DrawTarget,
  b: Box,
  block: number | string,
  chance: number,
  salt = 0,
  test: (id: number) => boolean = () => true
): void {
  for (let y = b.y0; y <= b.y1; y++) {
    for (let z = b.z0; z <= b.z1; z++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (t.hash(x, y, z, salt) < chance) t.setIf(x, y, z, block, test)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rooms and openings
// ---------------------------------------------------------------------------

export interface RoomOptions {
  /** Wall material. */
  readonly wall: BlockSpec
  /** Floor (default: wall). */
  readonly floor?: BlockSpec
  /** Ceiling (default: wall); null leaves the top open (courtyards). */
  readonly ceiling?: BlockSpec | null
  /** Fill of the inside (default air). */
  readonly interior?: BlockSpec
  /** Floors between the levels of a multi-level module (default true; false = one tall hall). */
  readonly interiorFloors?: boolean
  /** Material framing door openings (default none). */
  readonly doorFrame?: BlockSpec
  /** Carve doorways for open connectors (default true). */
  readonly doors?: boolean
}

/**
 * The standard module shell: walls on the box boundary, floor, ceiling,
 * interior floors per level, air inside, and a doorway through the wall for
 * every OPEN connector (closed connectors stay wall). Two joined modules each
 * carve their own half of a 2-thick doorway at the same place.
 */
export function room(ctx: ModuleContext, o: RoomOptions): void {
  const { w, h, d, floorHeight: fh } = ctx
  const floor = o.floor ?? o.wall
  ctx.fill(0, 0, 0, w - 1, h - 1, d - 1, o.wall)
  ctx.fill(1, 1, 1, w - 2, h - 2, d - 2, o.interior ?? BlockIds.AIR)
  ctx.fill(0, 0, 0, w - 1, 0, d - 1, floor)
  if (o.ceiling === null) ctx.fill(1, h - 1, 1, w - 2, h - 1, d - 2, BlockIds.AIR)
  else if (o.ceiling !== undefined) ctx.fill(0, h - 1, 0, w - 1, h - 1, d - 1, o.ceiling)
  if (o.interiorFloors !== false) {
    const levels = Math.round(h / fh)
    for (let k = 1; k < levels; k++) ctx.fill(1, k * fh, 1, w - 2, k * fh, d - 2, floor)
  }
  if (o.doors !== false) doorways(ctx, o.doorFrame)
}

/** Carve every open connector's doorway (optionally framed). */
export function doorways(ctx: ModuleContext, frame?: BlockSpec): void {
  for (const c of ctx.connectors) {
    if (!c.open) continue
    doorway(ctx, ctx.doorwayBox(c), c.face, frame)
  }
}

/** Carve one doorway box; a frame (posts + lintel) is drawn around wall doorways. */
export function doorway(t: DrawTarget, b: Box, face: Face, frame?: BlockSpec): void {
  if (frame !== undefined && face < 4) {
    const alongX = face === Face.North || face === Face.South
    if (alongX) {
      t.fill(b.x0 - 1, b.y0, b.z0, b.x0 - 1, b.y1 + 1, b.z1, frame)
      t.fill(b.x1 + 1, b.y0, b.z0, b.x1 + 1, b.y1 + 1, b.z1, frame)
      t.fill(b.x0, b.y1 + 1, b.z0, b.x1, b.y1 + 1, b.z1, frame)
    } else {
      t.fill(b.x0, b.y0, b.z0 - 1, b.x1, b.y1 + 1, b.z0 - 1, frame)
      t.fill(b.x0, b.y0, b.z1 + 1, b.x1, b.y1 + 1, b.z1 + 1, frame)
      t.fill(b.x0, b.y1 + 1, b.z0, b.x1, b.y1 + 1, b.z1, frame)
    }
  }
  carve(t, b)
}

/** Is any connector on this face open? (canonical face) */
export function isFaceOpen(ctx: ModuleContext, face: Face): boolean {
  return ctx.connectors.some((c) => c.open && c.face === face)
}

/** Open connectors of a given face (canonical). */
export function openConnectors(ctx: ModuleContext, face?: Face): ModuleConnector[] {
  return ctx.connectors.filter((c) => c.open && (face === undefined || c.face === face))
}

export interface WindowOptions {
  /** Window fill (e.g. GLASS, iron bars; default air). */
  readonly block?: BlockSpec
  /** Window height in blocks (default 2), bottom at floor + `sill` (default 2). */
  readonly height?: number
  readonly sill?: number
  /** Width (default 1) and spacing between window centres along the wall (default cellSize). */
  readonly width?: number
}

/**
 * Windows on every outer wall face (no module beyond it), one per cell per
 * level, centred, avoiding doorways.
 */
export function windows(ctx: ModuleContext, o: WindowOptions = {}): void {
  const { cellSize: cs, floorHeight: fh } = ctx
  const [sx, sy, sz] = ctx.def.size
  const height = o.height ?? 2
  const sill = o.sill ?? 2
  const width = o.width ?? 1
  const block = o.block ?? BlockIds.AIR
  const off = Math.floor((cs - width) / 2)
  for (let cy = 0; cy < sy; cy++) {
    const y0 = cy * fh + sill
    const y1 = y0 + height - 1
    for (let cx = 0; cx < sx; cx++) {
      for (let cz = 0; cz < sz; cz++) {
        for (const face of [Face.East, Face.South, Face.West, Face.North] as Face[]) {
          const onEdge =
            (face === Face.East && cx === sx - 1) ||
            (face === Face.West && cx === 0) ||
            (face === Face.South && cz === sz - 1) ||
            (face === Face.North && cz === 0)
          if (!onEdge || !ctx.isOuterFace(cx, cy, cz, face)) continue
          if (ctx.connectors.some((c) => c.open && c.face === face && c.cell[0] === cx && c.cell[1] === cy && c.cell[2] === cz)) continue
          const a = (face === Face.North || face === Face.South ? cx : cz) * cs + off
          if (face === Face.East) ctx.fill(ctx.w - 1, y0, a, ctx.w - 1, y1, a + width - 1, block)
          else if (face === Face.West) ctx.fill(0, y0, a, 0, y1, a + width - 1, block)
          else if (face === Face.South) ctx.fill(a, y0, ctx.d - 1, a + width - 1, y1, ctx.d - 1, block)
          else ctx.fill(a, y0, 0, a + width - 1, y1, 0, block)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Structural details
// ---------------------------------------------------------------------------

/** A square pillar (size×size) from y0 to y1 with an optional capital/base block. */
export function pillar(
  t: DrawTarget,
  x: number,
  z: number,
  y0: number,
  y1: number,
  block: BlockSpec,
  size = 1,
  capital?: BlockSpec
): void {
  t.fill(x, y0, z, x + size - 1, y1, z + size - 1, block)
  if (capital !== undefined) {
    t.fill(x, y0, z, x + size - 1, y0, z + size - 1, capital)
    t.fill(x, y1, z, x + size - 1, y1, z + size - 1, capital)
  }
}

/**
 * A rounded arch spanning [a0, a1] along X (alongX) or Z, at plane `p`
 * (the other horizontal axis), springing at y0 and peaking at y0 + rise.
 */
export function arch(t: DrawTarget, alongX: boolean, a0: number, a1: number, p: number, y0: number, rise: number, block: BlockSpec): void {
  const span = a1 - a0
  for (let i = 0; i <= span; i++) {
    const u = span === 0 ? 0 : (i / span) * 2 - 1 // -1..1
    const top = y0 + rise
    const bottom = y0 + Math.round(rise * Math.sqrt(Math.max(0, 1 - u * u)))
    for (let y = bottom; y <= top; y++) {
      if (alongX) t.set(a0 + i, y, p, block)
      else t.set(p, y, a0 + i, block)
    }
  }
}

/** Battlements (alternating merlons) on the perimeter of a rectangle, standing at height y. */
export function battlements(t: DrawTarget, x0: number, z0: number, x1: number, z1: number, y: number, block: BlockSpec, height = 1): void {
  for (let x = x0; x <= x1; x++) {
    if ((x - x0) % 2 === 0) {
      t.fill(x, y, z0, x, y + height - 1, z0, block)
      t.fill(x, y, z1, x, y + height - 1, z1, block)
    }
  }
  for (let z = z0; z <= z1; z++) {
    if ((z - z0) % 2 === 0) {
      t.fill(x0, y, z, x0, y + height - 1, z, block)
      t.fill(x1, y, z, x1, y + height - 1, z, block)
    }
  }
}

/** A gable (pitched) roof over a rectangle, ridge along X (ridgeAlongX) or Z, eaves at height y. */
export function roofPitched(
  t: DrawTarget,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  block: BlockSpec,
  ridgeAlongX = true,
  gable?: BlockSpec
): void {
  const half = ridgeAlongX ? Math.floor((z1 - z0) / 2) : Math.floor((x1 - x0) / 2)
  for (let i = 0; i <= half; i++) {
    const yy = y + i
    if (ridgeAlongX) {
      t.fill(x0, yy, z0 + i, x1, yy, z0 + i, block)
      t.fill(x0, yy, z1 - i, x1, yy, z1 - i, block)
      if (gable !== undefined && z1 - i - 1 >= z0 + i + 1) {
        t.fill(x0, yy, z0 + i + 1, x0, yy, z1 - i - 1, gable)
        t.fill(x1, yy, z0 + i + 1, x1, yy, z1 - i - 1, gable)
      }
    } else {
      t.fill(x0 + i, yy, z0, x0 + i, yy, z1, block)
      t.fill(x1 - i, yy, z0, x1 - i, yy, z1, block)
      if (gable !== undefined && x1 - i - 1 >= x0 + i + 1) {
        t.fill(x0 + i + 1, yy, z0, x1 - i - 1, yy, z0, gable)
        t.fill(x0 + i + 1, yy, z1, x1 - i - 1, yy, z1, gable)
      }
    }
  }
}

/** A pyramidal (hipped/spire) roof: square rings shrinking by `step` per layer. */
export function roofPyramid(t: DrawTarget, x0: number, z0: number, x1: number, z1: number, y: number, block: BlockSpec, step = 1): number {
  let layer = 0
  let a0 = x0, a1 = x1, b0 = z0, b1 = z1
  while (a0 <= a1 && b0 <= b1) {
    walls(t, { x0: a0, y0: y + layer, z0: b0, x1: a1, y1: y + layer, z1: b1 }, block)
    a0 += step
    a1 -= step
    b0 += step
    b1 -= step
    layer++
  }
  return y + layer
}

/** A hemispherical dome shell centred at (cx, cy, cz) with radius r (lower half skipped). */
export function dome(t: DrawTarget, cx: number, cy: number, cz: number, r: number, block: BlockSpec, thickness = 1): void {
  const r2o = (r + 0.5) * (r + 0.5)
  const r2i = (r - thickness + 0.5) * (r - thickness + 0.5)
  for (let y = 0; y <= r; y++) {
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        const d2 = x * x + y * y + z * z
        if (d2 <= r2o && d2 > r2i) t.set(cx + x, cy + y, cz + z, block)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stairs and ladders
// ---------------------------------------------------------------------------

/** BlockFacing whose low side faces `face` (stairs ascend away from it). */
function facingOf(face: Face): number {
  switch (face) {
    case Face.East: return BlockFacing.EAST
    case Face.West: return BlockFacing.WEST
    case Face.North: return BlockFacing.NORTH
    default: return BlockFacing.SOUTH
  }
}

const OPPOSITE_HORIZONTAL: Record<number, Face> = { 0: Face.West, 1: Face.North, 2: Face.East, 3: Face.South }

/**
 * A straight staircase: `steps` steps starting at (x, y, z) - the first
 * step's cell - each one block further along `dir` and one higher, `width`
 * wide (extending to the right of `dir`... along +X for N/S runs, +Z for
 * E/W runs). `stair` is a stairs block id (oriented to ascend along `dir`)
 * or any material for full-block steps; below each step is filled with
 * `support` down to `supportBottom` (default: y - 1, i.e. one block).
 */
export function stairs(
  t: DrawTarget,
  x: number,
  y: number,
  z: number,
  dir: Face,
  steps: number,
  width: number,
  stair: BlockSpec,
  support: BlockSpec,
  supportBottom = y - 1,
  isStairBlock = typeof stair === 'number' && isStairsBlockId(stair)
): void {
  const [dx, , dz] = FACE_DIR[dir]
  const meta = isStairBlock ? t.facing(facingOf(OPPOSITE_HORIZONTAL[dir])) : undefined
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < width; k++) {
      const sx = x + dx * i + (dz !== 0 ? k : 0)
      const sz = z + dz * i + (dx !== 0 ? k : 0)
      const sy = y + i
      if (sy - 1 >= supportBottom) t.fill(sx, supportBottom, sz, sx, sy - 1, sz, support)
      t.set(sx, sy, sz, stair, meta)
      // Headroom above the step
      t.fill(sx, sy + 1, sz, sx, sy + 3, sz, BlockIds.AIR)
    }
  }
}

/** Stairs block ids the framework knows (for facing metadata). */
export function isStairsBlockId(id: number): boolean {
  return id === BlockIds.OAK_STAIRS || id === BlockIds.PINE_STAIRS || id === BlockIds.REDWOOD_STAIRS
}

/**
 * A spiral staircase in a (2r+1)² shaft centred at (cx, cz) from y0 up to
 * y1: a central post and one step per block turning around it, with air
 * above each step. Exits face the start direction every 8·r steps.
 */
export function spiralStairs(
  t: DrawTarget,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  step: BlockSpec,
  post: BlockSpec,
  r = 1
): void {
  const ring = spiralRing(r)
  t.fill(cx - r, y0, cz - r, cx + r, y1, cz + r, BlockIds.AIR)
  if (r >= 1) t.fill(cx - r + 1, y0, cz - r + 1, cx + r - 1, y1, cz + r - 1, post)
  for (let y = y0; y <= y1; y++) {
    const [ox, oz] = ring[(y - y0) % ring.length]
    t.set(cx + ox, y, cz + oz, step)
  }
}

/**
 * The step ring of a spiral staircase of radius r: offsets from the centre,
 * clockwise from the north-west corner. Step at height y sits at
 * `ring[(y - y0) % ring.length]`.
 */
export function spiralRing(r: number): Array<[number, number]> {
  const ring: Array<[number, number]> = []
  for (let x = -r; x < r; x++) ring.push([x, -r])
  for (let z = -r; z < r; z++) ring.push([r, z])
  for (let x = r; x > -r; x--) ring.push([x, r])
  for (let z = r; z > -r; z--) ring.push([-r, z])
  return ring
}

/** A ladder column (LADDER facing away from the wall it hangs on). */
export function ladder(t: DrawTarget, x: number, z: number, y0: number, y1: number, facing: number): void {
  const meta = t.facing(facing)
  for (let y = y0; y <= y1; y++) t.set(x, y, z, BlockIds.LADDER, meta)
}

/**
 * A ladder through an Up/Down connector's hole, in the hole's centre column
 * (rotation-invariant, so the modules above and below line up): for Up from
 * the level's floor to its ceiling hole, for Down just the floor hole.
 */
export function shaftLadder(ctx: ModuleContext, connector: ModuleConnector, facing: number = BlockFacing.SOUTH): void {
  const b = ctx.doorwayBox(connector)
  const x = (b.x0 + b.x1) >> 1
  const z = (b.z0 + b.z1) >> 1
  if (connector.face === Face.Up) ladder(ctx, x, z, connector.cell[1] * ctx.floorHeight + 1, b.y0, facing)
  else if (connector.face === Face.Down) ladder(ctx, x, z, b.y0, b.y0, facing)
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/** Fill a column from the terrain surface (exclusive) up to topY (inclusive), at most maxDepth blocks. */
export function foundationColumn(t: DrawTarget, x: number, z: number, topY: number, block: BlockSpec, maxDepth = 64): void {
  const ground = t.terrainY(x, z)
  const bottom = Math.max(ground + 1, topY - maxDepth)
  if (bottom <= topY) t.fill(x, bottom, z, x, topY, z, block)
}

/** Foundations under a rectangle (every column), top at y. */
export function foundation(t: DrawTarget, x0: number, z0: number, x1: number, z1: number, topY: number, block: BlockSpec, maxDepth = 64): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) foundationColumn(t, x, z, topY, block, maxDepth)
  }
}

/** Clear terrain/air above a rectangle from y0 to y1 (plateau cuts). */
export function clearAbove(t: DrawTarget, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void {
  t.fill(x0, y0, z0, x1, y1, z1, BlockIds.AIR)
}

/**
 * A path leading out of a gate: starting at (x, y, z) (the floor block just
 * outside the opening) and running up to `length` blocks along `dir`,
 * `width` wide (centred). Where the terrain is lower the path steps down one
 * block per block (with foundations below - a causeway); where it is higher
 * a trench is cut. Stops once it meets the terrain at its own level. With a
 * `stair` block (e.g. OAK_STAIRS) every level change gets a half step the
 * player walks up without jumping.
 */
export function approach(
  t: DrawTarget,
  x: number,
  y: number,
  z: number,
  dir: Face,
  length: number,
  width: number,
  block: BlockSpec,
  support: BlockSpec,
  stair?: number
): void {
  const [dx, , dz] = FACE_DIR[dir]
  const half = Math.floor(width / 2)
  const levels: number[] = []
  let level = y
  for (let i = 0; i < length; i++) {
    const px = x + dx * i
    const pz = z + dz * i
    let ground = -Infinity
    for (let k = -half; k <= half; k++) ground = Math.max(ground, t.terrainY(px + (dz !== 0 ? k : 0), pz + (dx !== 0 ? k : 0)))
    if (i > 0) {
      if (ground < level) level = Math.max(ground, level - 1)
      else if (ground > level) level = Math.min(ground, level + 1)
    }
    levels.push(level)
    if (i > 2 && ground === level) break
  }
  const downMeta = stair !== undefined ? t.facing(facingOf(dir)) : 0
  const upMeta = stair !== undefined ? t.facing(facingOf(OPPOSITE_HORIZONTAL[dir])) : 0
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]
    for (let k = -half; k <= half; k++) {
      const gx = x + dx * i + (dz !== 0 ? k : 0)
      const gz = z + dz * i + (dx !== 0 ? k : 0)
      foundationColumn(t, gx, gz, lv, support, 48)
      t.set(gx, lv, gz, block)
      t.fill(gx, lv + 1, gz, gx, lv + 4, gz, BlockIds.AIR)
      if (stair === undefined || i === 0) continue
      if (lv === levels[i - 1] - 1) t.set(gx, lv + 1, gz, stair, downMeta) // stepping down outward
    }
    if (stair !== undefined && i > 0 && lv === levels[i - 1] + 1) {
      for (let k = -half; k <= half; k++) {
        const gx = x + dx * (i - 1) + (dz !== 0 ? k : 0)
        const gz = z + dz * (i - 1) + (dx !== 0 ? k : 0)
        t.set(gx, lv, gz, stair, upMeta) // climbing out of a trench
      }
    }
  }
}
