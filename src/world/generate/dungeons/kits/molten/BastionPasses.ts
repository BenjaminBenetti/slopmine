import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { Face, FACE_DIR, type PassContext } from '../../DungeonTypes.ts'
import { battlements, foundationColumn, walls } from '../../DungeonBuild.ts'
import { BASTION_GARRISON as G, BASTION_SEA_Y } from './BastionConfig.ts'
import { FH } from './BastionBuild.ts'
import { GATE_HALF, TOWER_R, TOWER_TOP, WALL_H, WALL_T, enclosure, type Rect } from './BastionGeometry.ts'
import { planGateRoute, routeCell, type GateRoute } from './BastionGateRoute.ts'

/**
 * Whole-structure passes of the Infernal Bastion (world coordinates):
 * the plinth/bailey that meets the terrain (lava sea or badlands), the
 * curtain wall with its corner towers and gate, lava falls pouring into the
 * sea, pillar arcades under upper-level halls, and the causeway out of the
 * gate to land (BastionGateRoute picks the gate's side and the route).
 */

const AIR = BlockIds.AIR
const STAIRS = BlockIds.INFERNAL_BRICK_STAIRS
const SLAB = BlockIds.INFERNAL_BRICK_SLAB

/**
 * Foundation pass: the enclosure becomes one solid brick plinth from the
 * ground (or the lava sea floor) up to the bailey floor, and any badland
 * rock above the bailey inside the walls is cut away.
 */
export function bastionFoundation(ctx: PassContext): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const base = L.baseY
  const r = enclosure(L)
  const cutTop = base + 4 * FH + 2
  for (let x = Math.max(r.x0, clip.x0); x <= Math.min(r.x1, clip.x1); x++) {
    for (let z = Math.max(r.z0, clip.z0); z <= Math.min(r.z1, clip.z1); z++) {
      const ground = ctx.terrainHeight(x, z)
      if (ground < base - 1) ctx.fill(x, Math.max(ground + 1, L.passBox.y0), z, x, base - 1, z, 'foundation')
      ctx.set(x, base, z, 'floor')
      if (ground > base) ctx.fill(x, base + 1, z, x, Math.min(ground, cutTop), z, AIR)
    }
  }
}

/** Exterior pass (see the file comment). Markers (wall patrol) are placed in dry runs too. */
export function bastionExterior(ctx: PassContext): void {
  const L = ctx.layout
  const base = L.baseY
  const r = enclosure(L)
  const top = base + WALL_H
  // The wall gate and its causeway to land (may pierce another side than the gatehouse's)
  const route = planGateRoute(L, (x, z) => ctx.terrainHeight(x, z))
  const { alongX, axis, outerPlane, innerPlane } = route
  const lo = alongX ? r.x0 : r.z0
  const hi = alongX ? r.x1 : r.z1
  // Wall stairs run along the inner face on the side of the gate with room
  // for them; the wall patrol stands on the walk on the other side if it fits
  const stairStart = GATE_HALF + 2
  const stairSide = axis + stairStart + WALL_H <= hi - TOWER_R - 1 ? 1 : -1
  const patrolOffset = GATE_HALF + 5
  const patrolFits = (s: number): boolean => axis + s * patrolOffset >= lo + TOWER_R + 1 && axis + s * patrolOffset <= hi - TOWER_R - 1
  const patrolSide = patrolFits(-stairSide) ? -stairSide : stairSide
  const pa = axis + patrolSide * patrolOffset
  const px = alongX ? pa : innerPlane
  const pz = alongX ? innerPlane : pa
  // The patrol grate sits flush in the walk; its marker is recorded in dry
  // runs too, the block goes in last, after the walls
  if (ctx.dryRun) {
    ctx.garrison(px, top, pz, G.WALL_PATROL)
    return
  }

  // --- Arcades of pillars under upper-level halls standing over the bailey
  supports(ctx)
  // --- Bailey dressing in the open cells between the buildings
  baileyDecor(ctx)

  // --- Curtain wall (two planes), battlements, glyph lamps on the outer face
  walls(ctx, { x0: r.x0, y0: base + 1, z0: r.z0, x1: r.x1, y1: top, z1: r.z1 }, 'wall')
  walls(ctx, { x0: r.x0 + 1, y0: base + 1, z0: r.z0 + 1, x1: r.x1 - 1, y1: top, z1: r.z1 - 1 }, 'wall')
  battlements(ctx, r.x0, r.z0, r.x1, r.z1, top + 1, 'wall')
  for (let x = r.x0 + 6; x <= r.x1 - 6; x += 12) {
    ctx.set(x, base + 5, r.z0, 'glyph')
    ctx.set(x, base + 5, r.z1, 'glyph')
  }
  for (let z = r.z0 + 6; z <= r.z1 - 6; z += 12) {
    ctx.set(r.x0, base + 5, z, 'glyph')
    ctx.set(r.x1, base + 5, z, 'glyph')
  }

  // --- Buttresses rising out of the lava sea along the plinth (every 6 blocks)
  for (let x = r.x0 + 3; x <= r.x1 - 3; x += 6) {
    buttress(ctx, x, r.z0 - 1, base)
    buttress(ctx, x, r.z1 + 1, base)
  }
  for (let z = r.z0 + 3; z <= r.z1 - 3; z += 6) {
    buttress(ctx, r.x0 - 1, z, base)
    buttress(ctx, r.x1 + 1, z, base)
  }

  // --- Corner towers with brazier crowns and glyph stripes
  for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
    for (let x = cx - TOWER_R; x <= cx + TOWER_R; x++) {
      for (let z = cz - TOWER_R; z <= cz + TOWER_R; z++) foundationColumn(ctx, x, z, base, 'foundation', 64)
    }
    ctx.fill(cx - TOWER_R, base + 1, cz - TOWER_R, cx + TOWER_R, base + TOWER_TOP, cz + TOWER_R, 'wall')
    ctx.fill(cx - TOWER_R, base + TOWER_TOP - 1, cz - TOWER_R, cx + TOWER_R, base + TOWER_TOP - 1, cz + TOWER_R, 'trim')
    battlements(ctx, cx - TOWER_R, cz - TOWER_R, cx + TOWER_R, cz + TOWER_R, base + TOWER_TOP + 1, 'wall')
    ctx.light(cx, base + TOWER_TOP + 1, cz, BlockIds.INFERNAL_BRAZIER)
    const ox = cx === r.x0 ? cx - TOWER_R : cx + TOWER_R
    const oz = cz === r.z0 ? cz - TOWER_R : cz + TOWER_R
    for (const y of [base + 4, base + 8, base + 12]) {
      ctx.set(cx, y, oz, 'glyph')
      ctx.set(ox, y, cz, 'glyph')
    }
  }

  // --- Lava falls pouring from spouts on the sea-facing walls
  lavaFalls(ctx, r, top, route.face)

  // --- The gate: a gap through both planes, a raised portcullis, beacon posts
  for (let k = -GATE_HALF; k <= GATE_HALF; k++) {
    for (const plane of [outerPlane, innerPlane]) {
      const gx = alongX ? axis + k : plane
      const gz = alongX ? plane : axis + k
      ctx.fill(gx, base + 1, gz, gx, base + 4, gz, AIR)
      ctx.set(gx, base, gz, 'floor')
      ctx.set(gx, base + 5, gz, BlockIds.INFERNAL_IRON_BARS, alongX ? BlockFacing.SOUTH : BlockFacing.EAST)
    }
  }
  const gx = alongX ? axis : outerPlane
  const gz = alongX ? outerPlane : axis
  ctx.set(gx, base + 7, gz, 'glyph')
  for (const s of [-1, 1]) {
    const bx = alongX ? axis + s * (GATE_HALF + 1) : outerPlane
    const bz = alongX ? outerPlane : axis + s * (GATE_HALF + 1)
    ctx.set(bx, top + 1, bz, 'trim')
    ctx.light(bx, top + 2, bz, BlockIds.INFERNAL_BRAZIER)
  }
  // Wall stairs up to the walk, along the inner face beside the gate
  const inward = 2 * innerPlane - outerPlane // the bailey row along the inner plane
  const sa = axis + stairSide * stairStart
  const stairDir: Face = alongX ? (stairSide > 0 ? Face.East : Face.West) : stairSide > 0 ? Face.South : Face.North
  stairsAlong(ctx, alongX ? sa : inward, base + 1, alongX ? inward : sa, stairDir, WALL_H)

  // --- Causeway over the lava, down (or up) to the land
  causeway(ctx, route, base)

  // --- The wall patrol's grate, after everything that builds the wall walk
  ctx.garrison(px, top, pz, G.WALL_PATROL)
}

/**
 * The open bailey between the buildings: per empty grid cell (nothing at
 * any level), a brazier post, a small lava pool, drifted ash, a ruined wall
 * stub or a smithing corner - picked by a world-anchored hash.
 */
function baileyDecor(ctx: PassContext): void {
  const L = ctx.layout
  const base = L.baseY
  const cs = L.cellSize
  const R = ctx.kit.gridRadius
  const [lo, hi] = ctx.kit.levels
  const r = enclosure(L)
  for (let cx = -R; cx <= R; cx++) {
    for (let cz = -R; cz <= R; cz++) {
      // Only cells inside the walls (the grid reaches past a small castle's enclosure)
      const bx = L.originX + cx * cs
      const bz = L.originZ + cz * cs
      if (bx < r.x0 + WALL_T || bx + cs - 1 > r.x1 - WALL_T || bz < r.z0 + WALL_T || bz + cs - 1 > r.z1 - WALL_T) continue
      let empty = true
      for (let level = lo; level <= hi && empty; level++) if (L.moduleAt(cx, level, cz) >= 0) empty = false
      if (!empty) continue
      const x0 = L.originX + cx * cs
      const z0 = L.originZ + cz * cs
      const mx = x0 + 4
      const mz = z0 + 4
      const roll = ctx.hash(cx, 0, cz, 0xba1e)
      if (roll < 0.22) {
        ctx.fill(mx, base + 1, mz, mx, base + 2, mz, 'trim')
        ctx.light(mx, base + 3, mz, BlockIds.INFERNAL_BRAZIER)
      } else if (roll < 0.36) {
        ctx.fill(mx - 1, base, mz - 1, mx + 1, base, mz + 1, BlockIds.LAVA)
        for (let x = mx - 2; x <= mx + 2; x++) {
          for (let z = mz - 2; z <= mz + 2; z++) {
            if (Math.max(Math.abs(x - mx), Math.abs(z - mz)) === 2) ctx.set(x, base + 1, z, (x + z) % 2 === 0 ? 'magma' : 'wallDark')
          }
        }
      } else if (roll < 0.5) {
        for (let x = x0 + 1; x <= x0 + 7; x++) {
          for (let z = z0 + 1; z <= z0 + 7; z++) if (ctx.hash(x, base, z, 0xa5) < 0.45) ctx.set(x, base, z, 'ash')
        }
      } else if (roll < 0.6) {
        const h = 2 + Math.floor(ctx.hash(cx, 1, cz, 0xb2) * 2)
        ctx.fill(x0 + 2, base + 1, z0 + 2, x0 + 6, base + h, z0 + 2, 'rubble')
        ctx.fill(x0 + 2, base + 1, z0 + 3, x0 + 2, base + h - 1, z0 + 5, 'rubble')
      } else if (roll < 0.68) {
        ctx.set(mx, base + 1, mz, BlockIds.INFERNAL_ANVIL, BlockFacing.SOUTH)
        ctx.light(mx + 2, base + 1, mz, BlockIds.INFERNAL_BRAZIER)
      }
    }
  }
}

/** A pillar buttress from the lava-sea floor to the bailey level (only where the plinth stands in the sea). */
function buttress(ctx: PassContext, x: number, z: number, base: number): void {
  const ground = ctx.terrainHeight(x, z)
  if (ground >= base - 2) return
  ctx.fill(x, Math.max(ground + 1, ctx.layout.passBox.y0), z, x, base, z, 'trim')
}

/** Straight stairs of the bastion's stair block (ascending along `dir`) with solid fill under them. */
function stairsAlong(ctx: PassContext, x: number, y: number, z: number, dir: Face, steps: number): void {
  const [dx, , dz] = FACE_DIR[dir]
  const meta = dir === Face.East ? BlockFacing.WEST : dir === Face.West ? BlockFacing.EAST : dir === Face.South ? BlockFacing.NORTH : BlockFacing.SOUTH
  for (let i = 0; i < steps; i++) {
    const sx = x + dx * i
    const sz = z + dz * i
    const sy = y + i
    if (sy - 1 >= y) ctx.fill(sx, y, sz, sx, sy - 1, sz, 'wall')
    ctx.set(sx, sy, sz, STAIRS, meta)
    ctx.fill(sx, sy + 1, sz, sx, sy + 3, sz, AIR)
  }
}

/** Pillars (2×2 at each cell corner) under cells of level ≥ 1 modules with only open bailey or courtyards below. */
function supports(ctx: PassContext): void {
  const L = ctx.layout
  const base = L.baseY
  const cs = L.cellSize
  for (const m of L.modules) {
    if (m.cell[1] < 1) continue
    for (let cx = m.cell[0]; cx < m.cell[0] + m.size[0]; cx++) {
      for (let cz = m.cell[2]; cz < m.cell[2] + m.size[2]; cz++) {
        let clear = true
        for (let level = 0; level < m.cell[1]; level++) {
          const below = L.moduleAt(cx, level, cz)
          if (below >= 0 && !(L.modules[below].def.tags ?? []).includes('open')) clear = false
        }
        if (!clear) continue
        const x0 = L.originX + cx * cs
        const z0 = L.originZ + cz * cs
        for (const [px, pz] of [[x0, z0], [x0 + cs - 2, z0], [x0, z0 + cs - 2], [x0 + cs - 2, z0 + cs - 2]]) {
          ctx.fill(px, base + 1, pz, px + 1, m.box.y0 - 1, pz + 1, 'trim')
        }
      }
    }
  }
}

/**
 * Lava falls: on every wall side but the gate's, a spout every 12 blocks
 * (between the buttresses, which stand at 3 mod 6)
 * whose landing lies in the lava sea - a source in a notch of the outer
 * wall plane, a 7/8 overflow in front of it and a falling column to the sea
 * (the state liquid physics settles to, so it stays put).
 */
function lavaFalls(ctx: PassContext, r: Rect, top: number, gateFace: Face): void {
  const y = top - 1
  const sides: Array<{ face: Face; cells: Array<[number, number, number, number]> }> = []
  for (const face of [Face.North, Face.South, Face.East, Face.West] as Face[]) {
    if (face === gateFace) continue
    const cells: Array<[number, number, number, number]> = []
    if (face === Face.North || face === Face.South) {
      const z = face === Face.North ? r.z0 : r.z1
      const out = face === Face.North ? -1 : 1
      for (let x = r.x0 + 6; x <= r.x1 - 6; x += 12) cells.push([x, z, x, z + out])
    } else {
      const x = face === Face.West ? r.x0 : r.x1
      const out = face === Face.West ? -1 : 1
      for (let z = r.z0 + 6; z <= r.z1 - 6; z += 12) cells.push([x, z, x + out, z])
    }
    sides.push({ face, cells })
  }
  for (const side of sides) {
    for (const [sx, sz, fx, fz] of side.cells) {
      const landing = ctx.terrainHeight(fx, fz)
      if (landing >= BASTION_SEA_Y) continue
      ctx.set(sx, y, sz, BlockIds.LAVA)
      ctx.set(fx, y, fz, BlockIds.LAVA_SEVEN_EIGHTH)
      ctx.fill(fx, BASTION_SEA_Y + 1, fz, fx, y - 1, fz, BlockIds.LAVA_FALLING)
    }
  }
}

/**
 * Out of the gate along the planned route: a brick causeway on piers over
 * the lava sea (parapets, braziers), stairs wherever it steps down toward
 * the shore or up into a trench, and a path over the land until it meets
 * the ground at its own level.
 */
function causeway(ctx: PassContext, route: GateRoute, base: number): void {
  const out = route.face
  const back = out === Face.East ? Face.West : out === Face.West ? Face.East : out === Face.South ? Face.North : Face.South
  const downMeta = stairFacing(out) // low side outward: the route steps down away from the gate
  const upMeta = stairFacing(back)
  const { levels, sea } = route
  let prev = base
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]
    const next = i + 1 < levels.length ? levels[i + 1] : lv
    for (let k = -GATE_HALF; k <= GATE_HALF; k++) {
      const [x, z] = routeCell(route, i, k)
      const edge = Math.abs(k) === GATE_HALF
      // Piers every 6 steps (and solid fill over land), a two-block deck between them
      if (ctx.terrainHeight(x, z) < lv - 2 && i % 6 !== 3) ctx.fill(x, lv - 2, z, x, lv - 1, z, 'foundation')
      else foundationColumn(ctx, x, z, lv - 1, 'foundation', 48)
      ctx.set(x, lv, z, edge ? 'trim' : 'floor')
      ctx.fill(x, lv + 1, z, x, lv + 4, z, AIR)
      if (lv === prev - 1) {
        ctx.set(x, lv + 1, z, STAIRS, downMeta)
      } else if (lv === prev + 1) {
        const [bx, bz] = routeCell(route, i - 1, k)
        ctx.set(bx, lv, bz, STAIRS, upMeta)
      } else if (edge && sea[i] && lv === next) {
        if (i % 10 === 5) ctx.light(x, lv + 1, z, BlockIds.INFERNAL_BRAZIER)
        else ctx.set(x, lv + 1, z, SLAB, 0)
      }
    }
    prev = lv
  }
  // A dead end over the sea (no route met land): end in a beacon landing
  if (!route.reachesLand) {
    const i = levels.length - 1
    for (const k of [-GATE_HALF, GATE_HALF]) {
      const [x, z] = routeCell(route, i, k)
      ctx.light(x, levels[i] + 1, z, BlockIds.INFERNAL_BRAZIER)
    }
  }
}

/** BlockFacing of a stair whose low side faces `face` (it ascends away from it). */
function stairFacing(face: Face): number {
  switch (face) {
    case Face.East: return BlockFacing.EAST
    case Face.West: return BlockFacing.WEST
    case Face.North: return BlockFacing.NORTH
    default: return BlockFacing.SOUTH
  }
}
