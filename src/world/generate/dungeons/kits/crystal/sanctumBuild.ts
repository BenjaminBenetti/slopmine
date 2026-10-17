import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { SimplexNoise } from '../../../SimplexNoise.ts'
import { abyssFloorHeight } from '../../../crystal/CrystalAbyssShape.ts'
import { Face, doorways, roofPitched, room, type BlockSpec, type DrawTarget, type ModuleContext, type PassContext } from '../../index.ts'

/**
 * Prism Sanctum build helpers (worker-safe, pure): palette names, shared
 * room dressing, the switchback stair used by stair halls and the
 * observatory, and the real Crystal Abyss floor (terraces + chasms) for the
 * world-space passes.
 */

export const CS = 9
export const FH = 7
const AIR = BlockIds.AIR

export const SANCTUM_PALETTE = {
  wall: BlockIds.SANCTUM_BRICK,
  floor: BlockIds.SANCTUM_TILE,
  inlay: BlockIds.INLAID_SANCTUM_TILE,
  carved: BlockIds.CARVED_SANCTUM_BRICK,
  pillar: BlockIds.SANCTUM_PILLAR,
  trim: BlockIds.GILDED_SANCTUM_TRIM,
  mirror: BlockIds.MIRROR_PANEL,
  roof: BlockIds.PRISM_ROOF_TILE,
  glass: BlockIds.CRYSTAL_GLASS,
  archive: BlockIds.CRYSTAL_ARCHIVE,
  foundation: BlockIds.SANCTUM_BRICK,
  plinth: BlockIds.SANCTUM_TILE,
  // Decorative crystal: the non-emitting core twins (they glow through
  // their texture; light comes from lamps and lanterns only)
  crystal: BlockIds.SPIRE_CRYSTAL_CORE,
  rose: BlockIds.ROSE_CRYSTAL_CORE,
  light: BlockIds.CRYSTAL_LAMP,
} as const

// ---------------------------------------------------------------------------
// Terrain (passes, world space)
// ---------------------------------------------------------------------------

let cachedNoise: SimplexNoise | null = null
let cachedSeed = 0

function noiseFor(seed: number): SimplexNoise {
  if (!cachedNoise || cachedSeed !== seed) {
    cachedNoise = new SimplexNoise(seed)
    cachedSeed = seed
  }
  return cachedNoise
}

/**
 * The real Crystal Abyss floor at a world column: the framework's terrain
 * height is the biome's base height; the biome shapes it into terraces and
 * chasms (CrystalAbyssShape). Pure.
 */
export function abyssGround(ctx: PassContext, x: number, z: number): number {
  return abyssFloorHeight(noiseFor(ctx.layout.seed), x, z, ctx.terrainHeight(x, z))
}

// ---------------------------------------------------------------------------
// Module helpers
// ---------------------------------------------------------------------------

/**
 * May the module wear a roof? Its top must stand above the ground floor
 * (undercroft modules lie under the plinth) and nothing may be built above
 * any of its top cells.
 */
export function topOpen(ctx: ModuleContext): boolean {
  const [sx, sy, sz] = ctx.def.size
  if (ctx.level + sy < 1) return false
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) if (ctx.isCellOccupied(x, sy, z)) return false
  return true
}

/** A low pitched roof with gilded cornice and crystal finials on the gables (rooms without their own crown). */
export function gabledRoof(ctx: ModuleContext): void {
  if (!topOpen(ctx)) return
  const { w, d, h } = ctx
  cornice(ctx)
  const alongX = w >= d
  roofPitched(ctx, 0, 0, w - 1, d - 1, h, 'roof', alongX, 'wall')
  const rise = Math.floor(((alongX ? d : w) - 1) / 2)
  if (alongX) {
    ctx.set(0, h + rise + 1, rise, 'rose')
    ctx.set(w - 1, h + rise + 1, rise, 'rose')
  } else {
    ctx.set(rise, h + rise + 1, 0, 'rose')
    ctx.set(rise, h + rise + 1, d - 1, 'rose')
  }
}

/**
 * A solid stepped pyramid (each layer a filled rectangle, inset by `step`
 * per side): no hollow attic shows through the steps. Returns the Y above
 * the top layer.
 */
export function roofPyramid(
  t: DrawTarget, x0: number, z0: number, x1: number, z1: number, y: number, block: BlockSpec, step = 1
): number {
  let layer = 0
  while (x0 <= x1 && z0 <= z1) {
    t.fill(x0, y + layer, z0, x1, y + layer, z1, block)
    x0 += step
    x1 -= step
    z0 += step
    z1 -= step
    layer++
  }
  return y + layer
}

/** A small stepped pyramid with a crystal finial (single-cell rooms). */
export function pyramidRoof(ctx: ModuleContext): void {
  if (!topOpen(ctx)) return
  const { w, d, h } = ctx
  cornice(ctx)
  const top = roofPyramid(ctx, 0, 0, w - 1, d - 1, h, 'roof')
  ctx.set(w >> 1, top, d >> 1, 'crystal')
  ctx.set(w >> 1, top + 1, d >> 1, 'rose')
}

/**
 * Gilded cornice ring on the roof edge (y = h), with a crystal lamp on each
 * corner: the sanctum's outline reads from across the cavern (4 emitters).
 */
export function cornice(ctx: ModuleContext): void {
  const { w, h, d } = ctx
  // Only over top cells nothing is built on: y = h is the floor of a module
  // stacked above (an offset stack once wrote trim over its garrison)
  for (let x = 0; x < w; x++) {
    for (const z of [0, d - 1]) if (openAbove(ctx, x, z)) ctx.set(x, h, z, 'trim')
  }
  for (let z = 1; z < d - 1; z++) {
    for (const x of [0, w - 1]) if (openAbove(ctx, x, z)) ctx.set(x, h, z, 'trim')
  }
  // (one above the ring, so a roof starting on the ring keeps them)
  for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) if (openAbove(ctx, x, z)) ctx.light(x, h + 1, z)
}

/**
 * Is nothing built above the top cell holding the module-local column
 * (x, z)? Writes above the box (y >= h) must check it: there the next
 * level's modules begin.
 */
export function openAbove(ctx: ModuleContext, x: number, z: number): boolean {
  return !ctx.isCellOccupied(Math.floor(x / ctx.cellSize), ctx.def.size[1], Math.floor(z / ctx.cellSize))
}

/** Hanging prism lantern (light 14) under a ceiling at y + 1. */
export function lantern(ctx: ModuleContext, x: number, y: number, z: number): void {
  ctx.light(x, y, z, BlockIds.PRISM_LANTERN)
}

/** A violet banner hanging two blocks down from (x, y, z), facing away from its wall. */
export function banner(t: DrawTarget, x: number, y: number, z: number, facing: number): void {
  t.set(x, y, z, BlockIds.SANCTUM_BANNER, t.facing(facing))
}

/** A fluted column with a gilded capital (and base). */
export function column(t: DrawTarget, x: number, z: number, y0: number, y1: number, base = true): void {
  t.fill(x, y0, z, x, y1, z, 'pillar')
  t.set(x, y1, z, 'trim')
  if (base) t.set(x, y0, z, 'trim')
}

/** Standard shell: brick walls, tile floor, brick ceiling (null: open), carved door frames. */
export function shell(ctx: ModuleContext, interiorFloors = true, ceiling: string | null = 'wall'): void {
  room(ctx, { wall: 'wall', floor: 'floor', ceiling, interiorFloors, doorFrame: 'carved' })
}

/** Re-carve every open doorway (after dressing that might have covered one). */
export function reopenDoors(ctx: ModuleContext): void {
  doorways(ctx, 'carved')
}

/**
 * Chamfer the corners of a rectangular interior into an octagon: interior
 * cells within `k` (Manhattan) of a corner become `block`, from y0 to y1.
 * The diagonal faces left toward the room are returned via `face` cells
 * (Manhattan distance k - 1), which callers may dress (mirrors).
 */
export function chamfer(
  ctx: ModuleContext,
  x0: number, z0: number, x1: number, z1: number,
  k: number, y0: number, y1: number,
  block: string, faceBlock?: string, faceY0 = y0, faceY1 = y1
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const a = Math.min(x - x0, x1 - x) + Math.min(z - z0, z1 - z)
      if (a >= k) continue
      ctx.fill(x, y0, z, x, y1, z, block)
      if (faceBlock !== undefined && a === k - 1) ctx.fill(x, faceY0, z, x, faceY1, z, faceBlock)
    }
  }
}

/**
 * Switchback stair inside one 9×9 cell (interior x/z 1..7), climbing `rise`
 * (7 = one level, 6 = onto a roof slab at the module ceiling) from floor F:
 * a 2-wide flight up the east side northward (4 steps), a landing across
 * the north strip, and a flight up the west side southward to the floor
 * above, which gets a stairwell hole. Entry and exit are both by the
 * south side of the cell (x 3..5). Steps are full tiles (walkable with
 * single jumps); every step keeps two blocks of headroom.
 */
export function switchback(ctx: ModuleContext, F: number, rise = 7, ox = 0, oz = 0): void {
  for (let i = 0; i < 4; i++) {
    const z = oz + 7 - i
    const y = F + 1 + i
    ctx.fill(ox + 6, y, z, ox + 7, y, z, 'floor')
    ctx.fill(ox + 6, y + 1, z, ox + 7, y + 2, z, AIR)
  }
  ctx.fill(ox + 1, F + 4, oz + 1, ox + 7, F + 4, oz + 3, 'floor')
  ctx.fill(ox + 1, F + 5, oz + 1, ox + 7, F + 6, oz + 3, AIR)
  // Gilded edge on the landing's open side
  ctx.fill(ox + 3, F + 4, oz + 3, ox + 5, F + 4, oz + 3, 'trim')
  const stepsB = rise - 4
  for (let i = 0; i < stepsB; i++) {
    const z = oz + 4 + i
    const y = F + 5 + i
    ctx.fill(ox + 1, y, z, ox + 2, y, z, 'floor')
    ctx.fill(ox + 1, y + 1, z, ox + 2, y + 2, z, AIR)
  }
  // Stairwell hole in the floor above (the last step is that floor), reaching
  // over the landing's back row so a player stepping between the landing and
  // the first step of flight B keeps head room
  if (stepsB >= 2) ctx.fill(ox + 1, F + rise, oz + 3, ox + 2, F + rise, oz + 4 + stepsB - 2, AIR)
}

/**
 * A face-connected voxel circle of radius r around (0, 0): plot(u, v) for
 * every cell, with an axis step wherever the rounded circle moves
 * diagonally (rings hung in the air must not fall apart into pieces
 * that only touch at edges).
 */
export function ring6(r: number, plot: (u: number, v: number) => void): void {
  const n = Math.max(16, Math.ceil(Math.PI * 4 * r))
  let pu = Math.round(r)
  let pv = 0
  plot(pu, pv)
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const u = Math.round(Math.cos(t) * r)
    const v = Math.round(Math.sin(t) * r)
    if (u === pu && v === pv) continue
    if (u !== pu && v !== pv) plot(u, pv)
    plot(u, v)
    pu = u
    pv = v
  }
}

/** BlockFacing pointing from (x, z) toward (tx, tz) along the dominant axis. */
export function facingToward(x: number, z: number, tx: number, tz: number): number {
  const dx = tx - x
  const dz = tz - z
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? BlockFacing.EAST : BlockFacing.WEST
  return dz > 0 ? BlockFacing.SOUTH : BlockFacing.NORTH
}

/** Is any connector on this face open (canonical)? */
export function faceOpen(ctx: ModuleContext, face: Face): boolean {
  return ctx.connectors.some((c) => c.open && c.face === face)
}

/** Diamond inlay rosette of radius r centred at (cx, cz) on the floor (y 0). */
export function rosette(ctx: ModuleContext, cx: number, cz: number, r: number): void {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const m = Math.abs(dx) + Math.abs(dz)
      if (m === r || m === 0 || (dx === 0 && Math.abs(dz) < r) || (dz === 0 && Math.abs(dx) < r)) {
        ctx.set(cx + dx, 0, cz + dz, 'inlay')
      }
    }
  }
}
