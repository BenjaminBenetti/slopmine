import { Face, FACE_DIR, type DungeonLayout } from '../../DungeonTypes.ts'
import { SimplexNoise } from '../../../SimplexNoise.ts'
import { isRiverColumn } from '../../../molten/MoltenTerrain.ts'
import { BASTION_SEA_Y } from './BastionConfig.ts'
import { GATE_HALF, ROUTE_MAX, TOWER_R, enclosure, type Rect } from './BastionGeometry.ts'

/**
 * Where the Infernal Bastion's curtain-wall gate goes, and the causeway out
 * of it - planned so that every bastion can be walked into from land.
 *
 * The gatehouse module sits wherever the layout put it, but its door only
 * opens onto the bailey; the wall gate may be on any side (the bailey ring
 * runs all the way round inside the walls). A route runs straight out of
 * a candidate gate as a deck over the lava sea (never lower than one block
 * above it), steps down (or cuts up) one block per block, and must reach
 * land - columns above the sea, not cut by a lava river - for several
 * steps in a row, ending where it meets the ground; its landing must
 * connect outward (a flood fill over walkable land; islets don't count).
 * The causeway straight out of the gatehouse wins wherever it works;
 * otherwise the shortest route along any wall side (the gatehouse's side
 * preferred).
 *
 * Pure function of the layout, the terrain and the seed (rivers), so every
 * sub-chunk, the dry run and the main-thread locator agree. Planned once per
 * castle per thread.
 */

export type TerrainHeight = (x: number, z: number) => number

export interface GateRoute {
  /** Outward direction of the gate (the wall side it pierces). */
  readonly face: Face
  /** True for a North/South wall: the gate axis is an x, the route runs along z. */
  readonly alongX: boolean
  /** Gate centre along the wall. */
  readonly axis: number
  /** The wall's outer and inner planes on that side. */
  readonly outerPlane: number
  readonly innerPlane: number
  /** Path block Y per step (step 0 is the first block outside the outer plane). */
  readonly levels: readonly number[]
  /** Per step: true over the lava sea / low ground (piers and parapets), false on land. */
  readonly sea: readonly boolean[]
  /** False only for the fallback (no route meets land): a deck ending over the sea. */
  readonly reachesLand: boolean
}

/** Lowest path block over the lava sea (one above its surface). */
const DECK_MIN = BASTION_SEA_Y + 1
/** Land steps in a row the route must find before it may end. */
const LAND_RUN = 4
/** Gate positions sampled along each wall side. */
const AXIS_STEP = 6
/** Keep the gate this far from a wall corner (the tower, the gate, a parapet). */
const CORNER_CLEAR = TOWER_R + GATE_HALF + 2
/** Preference among the other routes for the gatehouse's side (in blocks of route length). */
const OTHER_AXIS_COST = 6
const OTHER_SIDE_COST = 12
/**
 * Connectivity check of the landing: hops of REACH_STEP blocks over land,
 * walkable block by block (up at most 1, down at most 4, like a player),
 * until REACH_OUT blocks beyond the walls.
 */
const REACH_STEP = 4
const REACH_OUT = 60
const MAX_CLIMB = 1
const MAX_DROP = 4

/** Planned routes by layout identity (the layout-time dry run and the rasterizer see different objects). */
const ROUTE_CACHE_SIZE = 16
const routes = new Map<string, GateRoute>()

let riverNoise: SimplexNoise | null = null
let riverNoiseSeed = NaN

/** The worker's terrain noise (ChunkGenerationWorker: `new SimplexNoise(seed)`), for the river canyons. */
function noiseFor(seed: number): SimplexNoise {
  if (!riverNoise || riverNoiseSeed !== seed) {
    riverNoise = new SimplexNoise(seed)
    riverNoiseSeed = seed
  }
  return riverNoise
}

/** World column of route step `i` (-1 = the gate in the outer plane), `k` blocks across the axis. */
export function routeCell(route: Pick<GateRoute, 'face' | 'alongX' | 'axis' | 'outerPlane'>, i: number, k: number): [number, number] {
  const [dx, , dz] = FACE_DIR[route.face]
  return route.alongX ? [route.axis + k, route.outerPlane + dz * (i + 1)] : [route.outerPlane + dx * (i + 1), route.axis + k]
}

function wallPlanes(r: Rect, face: Face): { outer: number; inner: number; lo: number; hi: number; alongX: boolean } {
  switch (face) {
    case Face.North: return { outer: r.z0, inner: r.z0 + 1, lo: r.x0, hi: r.x1, alongX: true }
    case Face.South: return { outer: r.z1, inner: r.z1 - 1, lo: r.x0, hi: r.x1, alongX: true }
    case Face.West: return { outer: r.x0, inner: r.x0 + 1, lo: r.z0, hi: r.z1, alongX: false }
    default: return { outer: r.x1, inner: r.x1 - 1, lo: r.z0, hi: r.z1, alongX: false }
  }
}

/** The gate route of a layout (cached: once per castle per thread). */
export function planGateRoute(layout: DungeonLayout, terrainHeight: TerrainHeight): GateRoute {
  const e = layout.entrance
  const key = `${layout.kitId}|${layout.anchorX}|${layout.anchorZ}|${layout.seed}|${layout.salt}|${layout.baseY}|${e.x},${e.z},${e.face}|${layout.modules.length}`
  let route = routes.get(key)
  if (route) {
    routes.delete(key)
  } else {
    route = computeGateRoute(layout, terrainHeight)
    while (routes.size >= ROUTE_CACHE_SIZE) routes.delete(routes.keys().next().value as string)
  }
  routes.set(key, route)
  return route
}

interface Candidate {
  readonly route: GateRoute
  readonly score: number
}

function computeGateRoute(layout: DungeonLayout, h: TerrainHeight): GateRoute {
  const r = enclosure(layout)
  const base = layout.baseY
  const noise = noiseFor(layout.seed)
  const isLand: LandTest = (x, z) => {
    const g = h(x, z)
    return g > BASTION_SEA_Y && !isRiverColumn(noise, x, z, g)
  }
  const e = layout.entrance
  const gateFace = e.face as Face
  const own = { face: gateFace, x: e.x, z: e.z }

  // Straight out of the gatehouse first (the causeway the castle was built
  // around), wherever it reaches land that connects outward
  const p0 = wallPlanes(r, gateFace)
  const ownAxis = Math.max(p0.lo + CORNER_CLEAR, Math.min(p0.hi - CORNER_CLEAR, p0.alongX ? e.x : e.z))
  const ownShell = { face: gateFace, alongX: p0.alongX, axis: ownAxis, outerPlane: p0.outer }
  const straight = traceRoute(ownShell, base, h, isLand, Infinity)
  if (straight) {
    const route: GateRoute = { ...ownShell, innerPlane: p0.inner, levels: straight.levels, sea: straight.sea, reachesLand: true }
    if (landConnectsOutward(route, r, h, isLand)) return route
  }

  // Else the shortest other routes (pruned to the best + one side's
  // preference); if none of them lands on ground that connects outward,
  // every route
  for (const prune of [true, false]) {
    const candidates = collectCandidates(r, base, own, h, isLand, prune)
    for (const c of candidates) if (landConnectsOutward(c.route, r, h, isLand)) return c.route
    if (!prune && candidates.length > 0) return candidates[0].route
  }

  // No route meets land: a level deck straight out of the gatehouse (not seen on real terrain)
  return {
    ...ownShell, innerPlane: p0.inner,
    levels: new Array(ROUTE_MAX - 4).fill(base), sea: new Array(ROUTE_MAX - 4).fill(true), reachesLand: false,
  }
}

type LandTest = (x: number, z: number) => boolean

/** Every candidate gate that meets land, best score first. */
function collectCandidates(
  r: Rect,
  base: number,
  own: { face: Face; x: number; z: number },
  h: TerrainHeight,
  isLand: LandTest,
  prune: boolean
): Candidate[] {
  const candidates: Candidate[] = []
  const faces = [own.face, ...[Face.North, Face.East, Face.South, Face.West].filter((f) => f !== own.face)]
  let bound = Infinity
  for (const face of faces) {
    const p = wallPlanes(r, face)
    const lo = p.lo + CORNER_CLEAR
    const hi = p.hi - CORNER_CLEAR
    if (lo > hi) continue
    const ownAxis = Math.max(lo, Math.min(hi, p.alongX ? own.x : own.z))
    const axes: number[] = []
    const mid = Math.round((lo + hi) / 2)
    for (let off = 0; mid - off >= lo || mid + off <= hi; off += AXIS_STEP) {
      for (const a of off === 0 ? [mid] : [mid - off, mid + off]) {
        if (a >= lo && a <= hi && !axes.includes(a) && !(face === own.face && a === ownAxis)) axes.push(a)
      }
    }
    for (const axis of axes) {
      const bias = face !== own.face ? OTHER_SIDE_COST : OTHER_AXIS_COST
      const shell = { face, alongX: p.alongX, axis, outerPlane: p.outer }
      const traced = traceRoute(shell, base, h, isLand, prune ? bound - bias : Infinity)
      if (!traced) continue
      const score = traced.levels.length + bias
      // Keep runners-up within one side's preference, in case the best lands on an islet
      bound = Math.min(bound, score + OTHER_SIDE_COST)
      candidates.push({ route: { ...shell, innerPlane: p.inner, levels: traced.levels, sea: traced.sea, reachesLand: true }, score })
    }
  }
  return candidates.sort((a, b) => a.score - b.score)
}

/**
 * The path out of one candidate gate, or null if it doesn't meet land
 * within ROUTE_MAX (or not before `bound` steps - a better one is known).
 */
function traceRoute(
  shell: Pick<GateRoute, 'face' | 'alongX' | 'axis' | 'outerPlane'>,
  base: number,
  h: TerrainHeight,
  isLand: LandTest,
  bound: number
): { levels: number[]; sea: boolean[] } | null {
  const gmax: number[] = []
  const land: boolean[] = []
  const limit = Math.min(ROUTE_MAX, bound)
  const step = (i: number): void => {
    let g = -Infinity
    let allLand = true
    for (let k = -GATE_HALF; k <= GATE_HALF; k++) {
      const [x, z] = routeCell(shell, i, k)
      g = Math.max(g, h(x, z))
      if (allLand && !isLand(x, z)) allLand = false
    }
    gmax.push(g)
    land.push(allLand)
  }
  // First run of LAND_RUN land steps
  let landAt = -1
  let run = 0
  for (let i = 0; i < limit && landAt < 0; i++) {
    step(i)
    run = land[i] ? run + 1 : 0
    if (run === LAND_RUN) landAt = i - LAND_RUN + 1
  }
  if (landAt < 0) return null
  // Levels: stay at the bailey level as long as possible, descend one block
  // per block to reach the landing level at landAt (never below the deck
  // minimum over the sea), follow the land on (stepping down from the gate
  // if the landing lies lower than the deck could descend), at most one
  // block up or down per step (a trench where the ground rises faster)
  const landing = gmax[landAt]
  const levels: number[] = []
  let prev = base
  for (let i = 0; i < limit; i++) {
    if (i >= gmax.length) step(i)
    const floor = land[i] ? gmax[i] : Math.max(DECK_MIN, gmax[i])
    const descent = Math.max(base - (i + 1), i < landAt ? Math.min(base, landing + (landAt - i)) : -Infinity)
    const level = Math.max(prev - 1, Math.min(prev + 1, Math.max(floor, descent)))
    levels.push(level)
    prev = level
    if (i >= landAt + LAND_RUN - 1 && land[i] && level === gmax[i]) return { levels, sea: land.slice(0, levels.length).map((l) => !l) }
  }
  return null
}

/**
 * Flood fill over land from the route's end, in hops of REACH_STEP blocks
 * that a player could walk (every block on land, no river, climbing at most
 * MAX_CLIMB and dropping at most MAX_DROP per block): does it lead REACH_OUT
 * blocks beyond the walls? (Conservative - straight hops only.)
 */
function landConnectsOutward(route: GateRoute, r: Rect, h: TerrainHeight, isLand: LandTest): boolean {
  const [sx, sz] = routeCell(route, route.levels.length - 1, 0)
  const keep = TOWER_R + 1
  const span = REACH_OUT + REACH_STEP
  const box = { x0: r.x0 - span, z0: r.z0 - span, x1: r.x1 + span, z1: r.z1 + span }
  const outside = (x: number, z: number): number => Math.max(r.x0 - x, x - r.x1, r.z0 - z, z - r.z1)
  const seen = new Set<number>()
  const key = (x: number, z: number): number => (x - box.x0) * 65536 + (z - box.z0)
  const stack: Array<[number, number, number]> = [[sx, sz, h(sx, sz)]]
  seen.add(key(sx, sz))
  while (stack.length > 0) {
    const [x, z, g] = stack.pop()!
    if (outside(x, z) >= REACH_OUT) return true
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ux * REACH_STEP
      const nz = z + uz * REACH_STEP
      if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1 || outside(nx, nz) < keep) continue
      const k = key(nx, nz)
      if (seen.has(k)) continue
      // Walk the hop block by block
      let level = g
      let ok = true
      for (let s = 1; s <= REACH_STEP && ok; s++) {
        const cx = x + ux * s
        const cz = z + uz * s
        if (!isLand(cx, cz)) {
          ok = false
          break
        }
        const next = h(cx, cz)
        if (next - level > MAX_CLIMB || level - next > MAX_DROP) ok = false
        level = next
      }
      if (!ok) continue
      seen.add(k)
      stack.push([nx, nz, level])
    }
  }
  return false
}

/**
 * True if (x, z) lies within `margin` blocks of what the bastion builds on
 * the ground: the curtain wall with its towers and buttresses, or the
 * causeway corridor out of the gate. Other Hell features (pillars) keep out.
 */
export function isInBastionFootprint(layout: DungeonLayout, terrainHeight: TerrainHeight, x: number, z: number, margin: number): boolean {
  const r = enclosure(layout)
  const m = margin + TOWER_R + 1
  if (x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m) return true
  const route = planGateRoute(layout, terrainHeight)
  const [dx, , dz] = FACE_DIR[route.face]
  const along = route.alongX ? (z - route.outerPlane) * dz : (x - route.outerPlane) * dx
  const across = Math.abs((route.alongX ? x : z) - route.axis)
  return along >= 0 && along <= route.levels.length + margin && across <= GATE_HALF + 1 + margin
}
