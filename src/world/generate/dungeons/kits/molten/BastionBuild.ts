import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, type ModuleContext } from '../../DungeonTypes.ts'
import { battlements, doorways, spiralRing } from '../../DungeonBuild.ts'

/**
 * Shared drawing helpers of the Infernal Bastion kit (module-local frames
 * unless noted). Everything is a pure function of its arguments (seam-safe).
 */

/** Blocks per cell and per level. */
export const CS = 9
export const FH = 7

/** BlockFacing for a canonical wall face (the direction a wall-mounted piece looks: into the room). */
export function inwardFacing(face: Face): number {
  switch (face) {
    case Face.North: return BlockFacing.SOUTH
    case Face.South: return BlockFacing.NORTH
    case Face.East: return BlockFacing.WEST
    default: return BlockFacing.EAST
  }
}

/** Nothing above any cell of the module: its roof is outside. */
export function hasOpenRoof(ctx: ModuleContext): boolean {
  const [sx, sy, sz] = ctx.def.size
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) if (ctx.isCellOccupied(x, sy, z)) return false
  return true
}

/** Merlons around the roof edge (needs overhang.up ≥ 1). */
export function crenellate(ctx: ModuleContext, block = 'wall'): void {
  if (!hasOpenRoof(ctx)) return
  battlements(ctx, 0, 0, ctx.w - 1, ctx.d - 1, ctx.h, block)
}

/**
 * Iron-bar windows on every outer wall, one per cell per level, centred,
 * skipping doorways; the bars' plane follows the wall.
 */
export function barWindows(ctx: ModuleContext, sill = 2, height = 2, width = 1): void {
  const [sx, sy, sz] = ctx.def.size
  const off = Math.floor((CS - width) / 2)
  for (let cy = 0; cy < sy; cy++) {
    const y0 = cy * FH + sill
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
          const a = (face === Face.North || face === Face.South ? cx : cz) * CS + off
          const meta = ctx.facing(face === Face.North || face === Face.South ? BlockFacing.SOUTH : BlockFacing.EAST)
          if (face === Face.East) ctx.fill(ctx.w - 1, y0, a, ctx.w - 1, y1, a + width - 1, BlockIds.INFERNAL_IRON_BARS, meta)
          else if (face === Face.West) ctx.fill(0, y0, a, 0, y1, a + width - 1, BlockIds.INFERNAL_IRON_BARS, meta)
          else if (face === Face.South) ctx.fill(a, y0, ctx.d - 1, a + width - 1, y1, ctx.d - 1, BlockIds.INFERNAL_IRON_BARS, meta)
          else ctx.fill(a, y0, 0, a + width - 1, y1, 0, BlockIds.INFERNAL_IRON_BARS, meta)
        }
      }
    }
  }
}

/** An ember lantern hanging under the ceiling of level `level` (with a chain link above when there's room). */
export function hangLantern(ctx: ModuleContext, x: number, z: number, level = 0, drop = 1): void {
  const ceiling = level * FH + FH - 1
  const y = ceiling - drop
  for (let cy = y + 1; cy < ceiling; cy++) ctx.set(x, cy, z, BlockIds.INFERNAL_CHAIN)
  ctx.light(x, y, z, BlockIds.EMBER_LANTERN)
}

/** A floor-standing brazier (light 15). */
export function brazier(ctx: ModuleContext, x: number, y: number, z: number): void {
  ctx.light(x, y, z, BlockIds.INFERNAL_BRAZIER)
}

/** A war banner on the wall at `face` (canonical), hanging at (x, y, z) inside the room. */
export function banner(ctx: ModuleContext, x: number, y: number, z: number, wallFace: Face): void {
  ctx.set(x, y, z, BlockIds.INFERNAL_BANNER, ctx.facing(inwardFacing(wallFace)))
}

/** A weapon rack against the wall at `wallFace`. */
export function rack(ctx: ModuleContext, x: number, y: number, z: number, wallFace: Face): void {
  ctx.set(x, y, z, BlockIds.WEAPON_RACK, ctx.facing(inwardFacing(wallFace)))
}

/** Re-carve every open doorway (after furnishing), no frame. */
export function clearDoorways(ctx: ModuleContext): void {
  doorways(ctx)
}

/**
 * Fill each cell of a box with `block` if the position hash is below
 * `chance` and the cell is air (rubble, ash, scattered decor).
 */
export function scatter(ctx: ModuleContext, x0: number, y: number, z0: number, x1: number, z1: number, block: number | string, chance: number, salt: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (ctx.hash(x, y, z, salt) < chance) ctx.setIf(x, y, z, block, (id) => id === BlockIds.AIR)
    }
  }
}

/** Stairs block metadata (BlockFacing) so a stair ascends toward `dir` (canonical). */
export function stairFacing(dir: Face): number {
  // Stairs facing SOUTH ascend toward -Z (north): the facing is the low side
  switch (dir) {
    case Face.North: return BlockFacing.SOUTH
    case Face.South: return BlockFacing.NORTH
    case Face.East: return BlockFacing.WEST
    default: return BlockFacing.EAST
  }
}

/**
 * Under every corner step of a spiralStairs(cx, cz, y0, y1, r) - a corner
 * touches the newel only along an edge, so it would hang in the air - a
 * block of `support` (below the step, beside the one before it).
 */
export function spiralCornerSupports(ctx: ModuleContext, cx: number, cz: number, y0: number, y1: number, r: number, support: string): void {
  const ring = spiralRing(r)
  for (let y = y0 + 1; y <= y1; y++) {
    const [ox, oz] = ring[(y - y0) % ring.length]
    if (Math.abs(ox) === r && Math.abs(oz) === r) ctx.set(cx + ox, y - 1, cz + oz, support)
  }
}
