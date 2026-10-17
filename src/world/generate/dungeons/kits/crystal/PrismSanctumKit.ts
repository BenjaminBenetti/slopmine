import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import {
  FACE_DIR, Face, defaultBaseY, registerDungeonKit,
  type DungeonKit, type LayoutInfo, type PassContext, type PlacedModule,
} from '../../index.ts'
import { PRISM_SANCTUM_KIT_ID } from './PrismSanctumConfig.ts'
import { PRISM_SANCTUM_MODULES } from './PrismSanctumModules.ts'
import { CS, FH, SANCTUM_PALETTE, abyssGround, column } from './sanctumBuild.ts'

/**
 * PRISM SANCTUM - the Crystal Abyss dungeon kit (DESIGN2): a sprawling
 * geometric temple of the light-worshipping acolytes, grown from the
 * modules in PrismSanctumModules.ts (gate, octagon hubs, galleries,
 * colonnades, terraces, bridges, stair halls and the grand stair, the
 * observatory spire, reliquaries, cells, scriptoria, garrison rooms, the
 * undercroft and the Warden's lens chamber).
 *
 * Whole-structure passes (world space):
 * - foundation: a sanctum-brick plinth under every module's footprint (+3
 *   blocks of tiled walkway) down to the real Crystal Abyss floor (terraces
 *   and chasms, see sanctumBuild.abyssGround), terrain above it cut away;
 *   arcades (corner pillars, gilded architraves) under upper-floor wings
 *   over open ground; piers under bridges.
 * - exterior: a gilded balustrade along the plinth edge with crystal lamp
 *   posts, inlaid courts with crystal planters on the open plinth, and the
 *   processional: one monotone stair from the gate toward the terrace in
 *   front of it (causeway with rails over low ground, a walled cut through
 *   high ground), flanked by lamp-crowned obelisks.
 *
 * Loot tiers: lootTierBlocks puts sanctum brick (tiers 0-1), a mirror panel
 * (2) or an inlaid tile (3) under each chest; src/crystal/PrismSanctumLoot.ts
 * keys one table on each (radius 1).
 */

/** Tiled walkway around every module on the plinth (blocks). */
const PLINTH_MARGIN = 3
/** Longest processional approach beyond the plinth (blocks). */
const APPROACH_LENGTH = 26
/** Processional width (odd). */
const APPROACH_WIDTH = 7
/** Lamp posts on the plinth edge every this many blocks. */
const POST_SPACING = 12
/** The processional always runs at least this far beyond the plinth. */
const APPROACH_MIN = 20
const AIR = BlockIds.AIR

function hasTag(m: PlacedModule, tag: string): boolean {
  return m.def.tags !== undefined && m.def.tags.includes(tag)
}

/** Default tiers, with the grand reliquary always tier 3. */
function tierFor(m: PlacedModule, layout: LayoutInfo): number {
  if (m.def.id === 'grand_reliquary' || hasTag(m, 'boss')) return 3
  const base = Math.min(2, Math.floor((3 * m.depth) / (layout.maxDepth + 1)))
  return hasTag(m, 'vault') ? Math.min(3, base + 1) : base
}

// ---------------------------------------------------------------------------
// Plinth membership (pure function of the layout)
// ---------------------------------------------------------------------------

interface PlinthInfo {
  x0: number
  z0: number
  x1: number
  z1: number
  /** Non-bridge module footprints expanded by the walkway margin. */
  boxes: Array<{ x0: number; z0: number; x1: number; z1: number }>
  /** Exact footprints of every module whose box spans the plinth level. */
  cores: Array<{ x0: number; z0: number; x1: number; z1: number }>
  bridges: PlacedModule[]
}

const plinthCache = new WeakMap<object, PlinthInfo>()

function plinthOf(ctx: PassContext): PlinthInfo {
  const L = ctx.layout
  const cached = plinthCache.get(L.modules)
  if (cached) return cached
  const info: PlinthInfo = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, boxes: [], cores: [], bridges: [] }
  for (const m of L.modules) {
    if (hasTag(m, 'bridge')) {
      info.bridges.push(m)
      continue
    }
    const b = { x0: m.box.x0 - PLINTH_MARGIN, z0: m.box.z0 - PLINTH_MARGIN, x1: m.box.x1 + PLINTH_MARGIN, z1: m.box.z1 + PLINTH_MARGIN }
    info.boxes.push(b)
    info.x0 = Math.min(info.x0, b.x0)
    info.z0 = Math.min(info.z0, b.z0)
    info.x1 = Math.max(info.x1, b.x1)
    info.z1 = Math.max(info.z1, b.z1)
  }
  for (const m of L.modules) {
    if (m.box.y0 <= L.baseY + 1 && m.box.y1 >= L.baseY + 1) {
      info.cores.push({ x0: m.box.x0, z0: m.box.z0, x1: m.box.x1, z1: m.box.z1 })
    }
  }
  plinthCache.set(L.modules, info)
  return info
}

function inBoxes(boxes: PlinthInfo['boxes'], x: number, z: number): boolean {
  for (const b of boxes) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true
  return false
}

// ---------------------------------------------------------------------------
// Foundation pass
// ---------------------------------------------------------------------------

function foundationPass(ctx: PassContext): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const P = plinthOf(ctx)
  const top = L.baseY
  const x0 = Math.max(clip.x0, P.x0)
  const x1 = Math.min(clip.x1, P.x1)
  const z0 = Math.max(clip.z0, P.z0)
  const z1 = Math.min(clip.z1, P.z1)
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!inBoxes(P.boxes, x, z)) continue
      const ground = Math.min(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
      const bottom = Math.max(ground + 1, top - 64)
      if (bottom <= top - 1) ctx.fill(x, bottom, z, x, top - 1, z, 'foundation')
      // A carved course just under the plinth rim shows where the temple begins
      if (top - 1 > ground) ctx.set(x, top - 1, z, 'carved')
      ctx.set(x, top, z, 'plinth')
      const high = Math.max(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
      const cut = Math.min(high, top + 3 * FH + 6)
      if (cut > top) ctx.fill(x, top + 1, z, x, cut, z, AIR)
    }
  }
  // Upper-floor modules over open ground stand on an arcade: a pillar at
  // every cell corner and a gilded architrave under the floor edges
  for (const m of L.modules) {
    const bottom = m.cell[1]
    if (bottom < 1) continue
    for (let cx = m.cell[0]; cx < m.cell[0] + m.size[0]; cx++) {
      for (let cz = m.cell[2]; cz < m.cell[2] + m.size[2]; cz++) {
        let below = bottom - 1
        while (below >= 0 && L.moduleAt(cx, below, cz) < 0) below--
        const yFrom = top + (below + 1) * FH + (below >= 0 ? 0 : 1)
        const yTo = top + bottom * FH - 1
        if (yTo < yFrom) continue
        const x0 = L.originX + cx * CS
        const z0 = L.originZ + cz * CS
        for (const [px, pz] of [[x0, z0], [x0 + CS - 1, z0], [x0, z0 + CS - 1], [x0 + CS - 1, z0 + CS - 1]]) {
          column(ctx, px, pz, yFrom, yTo, true)
        }
        ctx.fill(x0, yTo, z0, x0 + CS - 1, yTo, z0, 'trim')
        ctx.fill(x0, yTo, z0 + CS - 1, x0 + CS - 1, yTo, z0 + CS - 1, 'trim')
        ctx.fill(x0, yTo, z0, x0, yTo, z0 + CS - 1, 'trim')
        ctx.fill(x0 + CS - 1, yTo, z0, x0 + CS - 1, yTo, z0 + CS - 1, 'trim')
      }
    }
  }
  // Bridges stand on two piers each, spanning whatever lies below
  for (const m of P.bridges) {
    const alongX = m.box.x1 - m.box.x0 > m.box.z1 - m.box.z0
    const len = alongX ? m.box.x1 - m.box.x0 + 1 : m.box.z1 - m.box.z0 + 1
    const cx = (m.box.x0 + m.box.x1) >> 1
    const cz = (m.box.z0 + m.box.z1) >> 1
    for (const f of [0.28, 0.72]) {
      const px = alongX ? m.box.x0 + Math.round(f * (len - 1)) : cx
      const pz = alongX ? cz : m.box.z0 + Math.round(f * (len - 1))
      for (let x = px - 1; x <= px + 1; x++) {
        for (let z = pz - 1; z <= pz + 1; z++) {
          const ground = Math.min(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
          const pierTop = m.box.y0 - 1
          if (pierTop > ground) ctx.fill(x, Math.max(ground + 1, pierTop - 64), z, x, pierTop, z, 'foundation')
          ctx.set(x, pierTop, z, 'carved')
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exterior pass
// ---------------------------------------------------------------------------

/** Is (x, z) inside the processional corridor in front of the gate? */
function inApproach(ctx: PassContext, x: number, z: number): boolean {
  const e = ctx.layout.entrance
  const [dx, , dz] = FACE_DIR[e.face]
  const half = (APPROACH_WIDTH >> 1) + 1
  if (dx !== 0) {
    if (Math.abs(z - e.z) > half) return false
    const along = (x - e.x) * dx
    return along >= -1 && along <= APPROACH_LENGTH + PLINTH_MARGIN
  }
  if (Math.abs(x - e.x) > half) return false
  const along = (z - e.z) * dz
  return along >= -1 && along <= APPROACH_LENGTH + PLINTH_MARGIN
}

function exteriorPass(ctx: PassContext): void {
  if (ctx.dryRun) return
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const P = plinthOf(ctx)
  const top = L.baseY
  const x0 = Math.max(clip.x0, P.x0)
  const x1 = Math.min(clip.x1, P.x1)
  const z0 = Math.max(clip.z0, P.z0)
  const z1 = Math.min(clip.z1, P.z1)
  // Plinth rim: gilded edge course and balustrade, lamp posts at intervals
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!inBoxes(P.boxes, x, z) || inBoxes(P.cores, x, z)) continue
      const outX = !inBoxes(P.boxes, x - 1, z) || !inBoxes(P.boxes, x + 1, z)
      const outZ = !inBoxes(P.boxes, x, z - 1) || !inBoxes(P.boxes, x, z + 1)
      if (inApproach(ctx, x, z)) continue
      if (!outX && !outZ) {
        courtDressing(ctx, x, z)
        continue
      }
      ctx.set(x, top, z, 'trim')
      const postAlongX = outZ && ((x - L.originX) % POST_SPACING + POST_SPACING) % POST_SPACING === 7
      const postAlongZ = outX && ((z - L.originZ) % POST_SPACING + POST_SPACING) % POST_SPACING === 7
      if (postAlongX || postAlongZ) {
        column(ctx, x, z, top + 1, top + 3, false)
        ctx.light(x, top + 4, z)
      } else {
        ctx.set(x, top + 1, z, 'trim')
      }
    }
  }
  processional(ctx)
}

/**
 * Open courts on the plinth (cells with no module at ground level): an
 * inlaid diamond per cell and, in its centre, a crystal planter (glowing
 * through its texture; no light source).
 */
function courtDressing(ctx: PassContext, x: number, z: number): void {
  const L = ctx.layout
  const lx = ((x - L.originX) % CS + CS) % CS
  const lz = ((z - L.originZ) % CS + CS) % CS
  const cx = Math.floor((x - L.originX) / CS)
  const cz = Math.floor((z - L.originZ) / CS)
  if (L.moduleAt(cx, 0, cz) >= 0) return
  const top = L.baseY
  const m = Math.abs(lx - 4) + Math.abs(lz - 4)
  if (m === 3) ctx.set(x, top, z, 'inlay')
  if (m === 0) {
    ctx.set(x, top, z, BlockIds.GLITTERING_ABYSSAL_STONE)
    ctx.fill(x, top + 1, z, x, top + 2, z, 'crystal')
    if (ctx.hash(cx, 0, cz, 7) < 0.5) ctx.set(x, top + 3, z, 'rose')
  } else if (m === 1) {
    ctx.set(x, top, z, BlockIds.GLITTERING_ABYSSAL_STONE)
    if (ctx.hash(x, top, z, 11) < 0.5) ctx.set(x, top + 1, z, 'crystal')
  }
}

/**
 * The processional approach: from the gate outward across the plinth, then
 * one block down (or up) per step until it meets the real ground; tiled,
 * gold-edged, an inlaid centre line, sanctum stairs at each level change,
 * brick foundations below (causeway) or a cut above (trench), and obelisk
 * pairs with crystal lamps every 6 blocks.
 */
function processional(ctx: PassContext): void {
  const L = ctx.layout
  const e = L.entrance
  const dir = e.face
  const [dx, , dz] = FACE_DIR[dir]
  const half = APPROACH_WIDTH >> 1
  const at = (i: number, k: number): [number, number] =>
    [e.x + dx * i + (dz !== 0 ? k : 0), e.z + dz * i + (dx !== 0 ? k : 0)]
  const levels = processionalLevels(ctx, at, half)
  // Nothing to draw in this sub-chunk? (the plan is cached per layout)
  const clip = ctx.clip
  if (clip) {
    const [ax, az] = at(0, -(half + 1))
    const [bx, bz] = at(levels.length - 1, half + 1)
    if (Math.max(ax, bx) < clip.x0 || Math.min(ax, bx) > clip.x1 || Math.max(az, bz) < clip.z0 || Math.min(az, bz) > clip.z1) return
  }
  const downMeta = ctx.facing(dirFacing(dir))
  const upMeta = ctx.facing(dirFacing(opposite(dir)))
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]
    for (let k = -half; k <= half; k++) {
      const [x, z] = at(i, k)
      const ground = Math.min(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
      if (lv - 1 > ground) ctx.fill(x, Math.max(ground + 1, lv - 48), z, x, lv - 1, z, 'foundation')
      ctx.set(x, lv, z, k === 0 ? 'inlay' : Math.abs(k) === half ? 'trim' : 'floor')
      const high = Math.max(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
      ctx.fill(x, lv + 1, z, x, Math.min(Math.max(lv + 5, high), lv + 40), z, AIR)
      if (i > 0 && lv === levels[i - 1] - 1) ctx.set(x, lv + 1, z, BlockIds.SANCTUM_STAIRS, downMeta)
      // A gilded rail along a causeway's edge where the ground falls away
      if (Math.abs(k) === half && i > PLINTH_MARGIN) {
        const [sx, sz] = at(i, k + Math.sign(k))
        if (Math.min(abyssGround(ctx, sx, sz), ctx.terrainHeight(sx, sz)) < lv - 2) ctx.set(x, lv + 1, z, 'trim')
      }
    }
    if (i > 0 && lv === levels[i - 1] + 1) {
      for (let k = -half; k <= half; k++) {
        const [x, z] = at(i - 1, k)
        ctx.set(x, lv, z, BlockIds.SANCTUM_STAIRS, upMeta)
      }
    }
    // Retaining walls (brick, gilded coping) where the cut meets higher ground
    for (const side of [-(half + 1), half + 1]) {
      if (i <= PLINTH_MARGIN) break
      const [x, z] = at(i, side)
      const high = Math.max(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
      if (high <= lv + 1) continue
      const wallTop = Math.min(high, lv + 40)
      ctx.fill(x, lv, z, x, wallTop - 1, z, 'wall')
      ctx.set(x, wallTop, z, 'trim')
      if (wallTop - lv >= 4 && (i - PLINTH_MARGIN) % 6 === 3) ctx.light(x, lv + 3, z)
    }
    // Obelisks flanking the way (where the ground beside it is low)
    if (i > PLINTH_MARGIN && (i - PLINTH_MARGIN) % 6 === 3) {
      for (const side of [-(half + 1), half + 1]) {
        const [x, z] = at(i, side)
        if (Math.max(abyssGround(ctx, x, z), ctx.terrainHeight(x, z)) > lv + 1) continue
        const ground = Math.min(abyssGround(ctx, x, z), ctx.terrainHeight(x, z))
        if (lv > ground) ctx.fill(x, Math.max(ground + 1, lv - 48), z, x, lv, z, 'foundation')
        ctx.fill(x, lv + 1, z, x, lv + 4, z, 'pillar')
        ctx.set(x, lv + 5, z, 'trim')
        ctx.light(x, lv + 6, z)
        ctx.set(x, lv + 7, z, 'rose')
      }
    }
  }
}

const levelCache = new WeakMap<object, number[]>()

/**
 * Tread levels of the processional (pure, cached per layout). Level with
 * the gate across the plinth, then one block per step - always the same
 * way - toward the ground where the way ends (the terrace in front of the
 * gate), so it reads as one stair: a causeway over low ground, a walled
 * cut through high ground. It runs at least APPROACH_MIN beyond the plinth
 * and stops once it has met the ground.
 */
function processionalLevels(ctx: PassContext, at: (i: number, k: number) => [number, number], half: number): number[] {
  const L = ctx.layout
  const cached = levelCache.get(L.modules)
  if (cached) return cached
  const n = APPROACH_LENGTH + PLINTH_MARGIN
  // Ground along the way: the mean over its width
  const ground: number[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let k = -half; k <= half; k++) {
      const [x, z] = at(i, k)
      sum += abyssGround(ctx, x, z)
    }
    ground.push(Math.round(sum / (2 * half + 1)))
  }
  const target = Math.round((ground[n - 1] + ground[n - 2] + ground[n - 3]) / 3)
  const dir = Math.sign(target - L.baseY)
  const levels: number[] = []
  let level = L.baseY
  for (let i = 0; i < n; i++) {
    if (i > PLINTH_MARGIN && level !== target) level += dir
    levels.push(level)
    if (i > PLINTH_MARGIN + APPROACH_MIN && level === target && Math.abs(ground[i] - level) <= 1) break
  }
  levelCache.set(L.modules, levels)
  return levels
}

function dirFacing(face: Face): number {
  switch (face) {
    case Face.East: return BlockFacing.EAST
    case Face.West: return BlockFacing.WEST
    case Face.North: return BlockFacing.NORTH
    default: return BlockFacing.SOUTH
  }
}

function opposite(face: Face): Face {
  return ((face + 2) % 4) as Face
}

export const prismSanctumKit: DungeonKit = {
  id: PRISM_SANCTUM_KIT_ID,
  cellSize: CS,
  floorHeight: FH,
  gridRadius: 5,
  levels: [-1, 2],
  worldYRange: [6, 126],
  modules: PRISM_SANCTUM_MODULES,
  targetModules: [20, 30],
  require: [
    { tag: 'vault', count: 2 },
    // The grand reliquary (tier 3) in every sanctum
    { tag: 'treasure', count: 1 },
    { tag: 'garrison', count: 3 },
    // An octagonal hub hall in every sanctum
    { tag: 'hub', count: 1 },
    // Always a way down into the undercroft, and something down there
    { tag: 'descent', count: 1 },
    { tag: 'ascent', count: 1 },
    { tag: 'crypt', count: 1 },
  ],
  palette: SANCTUM_PALETTE,
  door: [3, 4],
  // Under each chest: tier 0-1 sanctum brick, 2 mirror panel, 3 inlaid tile
  lootTierBlocks: [BlockIds.SANCTUM_BRICK, BlockIds.SANCTUM_BRICK, BlockIds.MIRROR_PANEL, BlockIds.INLAID_SANCTUM_TILE],
  exteriorMargin: PLINTH_MARGIN + APPROACH_LENGTH + 6,
  foundationDepth: 64,
  exteriorHeight: 20,
  maxAttempts: 48,
  bossDepthFraction: 0.8,
  // Raised a step above the median ground: the temple stands on its plinth
  baseY: (ctx) => defaultBaseY(ctx) + 2,
  baseYRange: [30, 76],
  tierFor,
  foundation: foundationPass,
  exterior: exteriorPass,
}

registerDungeonKit(prismSanctumKit)
