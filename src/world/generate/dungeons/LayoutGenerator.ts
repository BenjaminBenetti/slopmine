import { DungeonRng, hashInts, hashString } from './DungeonRandom.ts'
import {
  FACE_DIR,
  oppositeFace,
  rotateFace,
  type BaseYContext,
  type Box,
  type ConnectorDef,
  type DungeonKit,
  type DungeonLayout,
  type DungeonMarker,
  type Face,
  type LayoutInfo,
  type ModuleDef,
  type PlacedConnector,
  type PlacedModule,
} from './DungeonTypes.ts'
import { buildModuleContext, runPass } from './DungeonContexts.ts'

/**
 * Seeded, deterministic castle layout: grows a module graph on the kit's 3D
 * cell grid from an entrance, along open connectors, then guarantees the
 * required modules (boss arena at/near the deepest point, the kit's
 * `require` tags, every def's `minCount`), caps spare connectors, and
 * dry-runs every builder once to collect markers (chests, garrisons, the
 * guardian). Same (kit, anchor, seed, salt, terrain) → same layout.
 */

export interface LayoutRequest {
  readonly kit: DungeonKit
  readonly anchorX: number
  readonly anchorZ: number
  readonly seed: number
  readonly salt: number
  /** Pure terrain height (the worker's blended height == the biome's own height inside the region interior). */
  readonly terrainHeight: (x: number, z: number) => number
}

const DEFAULTS = {
  door: [3, 4] as const,
  exteriorMargin: 8,
  foundationDepth: 48,
  exteriorHeight: 16,
  maxAttempts: 24,
  bossDepthFraction: 0.75,
}

/** Tags with a fixed role. */
const TAG_ENTRANCE = 'entrance'
const TAG_BOSS = 'boss'
const TAG_CAP = 'cap'
/** Modules that only ever join through the connector they were attached by (dead ends). */
const SEALED_TAGS = new Set([TAG_BOSS, TAG_CAP, 'vault'])

/** Max horizontal distance (blocks) from the anchor any castle of this kit can write. */
export function kitFootprintRadius(kit: DungeonKit): number {
  let side = 0
  for (const def of kit.modules) side = Math.max(side, def.overhang?.side ?? 0)
  const grid = (kit.gridRadius + 1) * kit.cellSize
  return grid + Math.max(kit.exteriorMargin ?? DEFAULTS.exteriorMargin, side)
}

/** Default base Y: median terrain height over a 5×5 sample grid across the inner footprint. */
export function defaultBaseY(ctx: BaseYContext): number {
  const heights: number[] = []
  const r = ctx.radius * 0.75
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      heights.push(ctx.terrainHeight(Math.round(ctx.anchorX + (i * r) / 2), Math.round(ctx.anchorZ + (j * r) / 2)))
    }
  }
  heights.sort((a, b) => a - b)
  return heights[Math.floor(heights.length / 2)]
}

/** Floor Y of level 0 for a castle at this anchor (the kit's hook or the default, clamped, rounded). */
export function computeDungeonBaseY(
  kit: DungeonKit,
  anchorX: number,
  anchorZ: number,
  terrainHeight: (x: number, z: number) => number
): number {
  const ctx: BaseYContext = { anchorX, anchorZ, radius: (kit.gridRadius + 0.5) * kit.cellSize, terrainHeight }
  let baseY = kit.baseY ? kit.baseY(ctx) : defaultBaseY(ctx)
  if (kit.baseYRange) baseY = Math.max(kit.baseYRange[0], Math.min(kit.baseYRange[1], baseY))
  return Math.round(baseY)
}

interface GrowState {
  readonly modules: PlacedModule[]
  readonly occupancy: Int16Array
  readonly countsByDef: Map<string, number>
  readonly countsByTag: Map<string, number>
  /** Unjoined connectors that may still take a module: [moduleIndex, connectorIndex]. */
  frontier: Array<[number, number]>
}

class Grid {
  readonly n: number
  readonly levelCount: number

  constructor(
    readonly radius: number,
    readonly minLevel: number,
    readonly maxLevel: number
  ) {
    this.n = radius * 2 + 1
    this.levelCount = maxLevel - minLevel + 1
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= -this.radius && x <= this.radius && z >= -this.radius && z <= this.radius && y >= this.minLevel && y <= this.maxLevel
    )
  }

  index(x: number, y: number, z: number): number {
    return ((y - this.minLevel) * this.n + (z + this.radius)) * this.n + (x + this.radius)
  }
}

/** Rotate a cell inside a w×d box by r quarter turns (E→S): returns [x, z]. */
function rotateCell(x: number, z: number, w: number, d: number, r: number): [number, number] {
  switch (r & 3) {
    case 1: return [d - 1 - z, x]
    case 2: return [w - 1 - x, d - 1 - z]
    case 3: return [z, w - 1 - x]
    default: return [x, z]
  }
}

function rotatedSize(def: ModuleDef, r: number): [number, number, number] {
  const [w, h, d] = def.size
  return r & 1 ? [d, h, w] : [w, h, d]
}

function hasTag(def: ModuleDef, tag: string): boolean {
  return def.tags !== undefined && def.tags.includes(tag)
}

function connectorKind(c: ConnectorDef): string {
  return c.kind ?? 'door'
}

/** Generate the layout (pure; ~ms). */
export function generateDungeonLayout(request: LayoutRequest): DungeonLayout {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const { kit, anchorX, anchorZ, seed, salt, terrainHeight } = request
  const cs = kit.cellSize
  const fh = kit.floorHeight

  const baseY = computeDungeonBaseY(kit, anchorX, anchorZ, terrainHeight)

  const originX = anchorX - Math.floor(cs / 2)
  const originZ = anchorZ - Math.floor(cs / 2)
  const grid = new Grid(kit.gridRadius, kit.levels[0], kit.levels[1])
  const yRange = kit.worldYRange ?? [-Infinity, Infinity]

  const cellMinX = (cx: number): number => originX + cx * cs
  const cellMinY = (cy: number): number => baseY + cy * fh
  const cellMinZ = (cz: number): number => originZ + cz * cs

  const maxAttempts = Math.max(1, kit.maxAttempts ?? DEFAULTS.maxAttempts)
  const kitSalt = hashString(kit.id)
  let best: { state: GrowState; score: number; attempt: number } | null = null
  let attemptsUsed = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attemptsUsed = attempt + 1
    const rng = new DungeonRng(hashInts(anchorX, anchorZ, (seed ^ salt ^ kitSalt) | 0, attempt))
    const state = grow(rng)
    const score = scoreState(state)
    if (!best || score > best.score) best = { state, score, attempt }
    if (score >= 1e6) break
  }

  const state = best!.state
  const fallback = best!.score < 1e6
  if (fallback) {
    console.warn(
      `[dungeons] ${kit.id} @ ${anchorX},${anchorZ}: no layout met every requirement in ${maxAttempts} attempts - using the best (score ${best!.score})`
    )
  }

  return finishLayout(state, attemptsUsed, fallback)

  // -------------------------------------------------------------------------

  function grow(rng: DungeonRng): GrowState {
    const s: GrowState = {
      modules: [],
      occupancy: new Int16Array(grid.n * grid.n * grid.levelCount).fill(-1),
      countsByDef: new Map(),
      countsByTag: new Map(),
      frontier: [],
    }

    if (!placeEntrance(s, rng)) return s

    const [tMin, tMax] = kit.targetModules
    const target = rng.int(tMin, tMax)
    const reserved = 1 + requiredShortfall(s)
    const growthDefs = kit.modules.filter((def) => !hasTag(def, TAG_ENTRANCE) && !hasTag(def, TAG_BOSS) && !hasTag(def, TAG_CAP))

    // Main growth
    const spare: Array<[number, number]> = []
    let guard = 0
    while (s.modules.length < target - reserved && s.frontier.length > 0 && guard++ < 4000) {
      const pickIndex = Math.floor(rng.next() * s.frontier.length)
      const entry = s.frontier[pickIndex]
      s.frontier[pickIndex] = s.frontier[s.frontier.length - 1]
      s.frontier.pop()
      if (!isFrontierOpen(s, entry)) continue
      const parentDepth = s.modules[entry[0]].depth
      const defs = rng.weightedOrder(growthDefs, (def) => growthWeight(s, def, parentDepth + 1))
      if (!tryAttach(s, rng, entry, defs)) spare.push(entry)
    }
    for (const entry of s.frontier) spare.push(entry)
    s.frontier = []

    // Required modules (kit tags and def minimums), then the boss
    for (const requirement of requirementsList()) {
      while (countTag(s, requirement.tag) < requirement.count) {
        const defs = kit.modules.filter((def) => hasTag(def, requirement.tag) && !hasTag(def, TAG_BOSS) && !hasTag(def, TAG_ENTRANCE))
        if (!attachSomewhere(s, rng, spare, defs, requirement.deepFirst)) break
      }
    }
    for (const def of kit.modules) {
      if (hasTag(def, TAG_BOSS) || hasTag(def, TAG_ENTRANCE)) continue
      while ((s.countsByDef.get(def.id) ?? 0) < (def.minCount ?? 0)) {
        if (!attachSomewhere(s, rng, spare, [def], (def.minDepth ?? 0) > 0)) break
      }
    }
    const bossDefs = kit.modules.filter((def) => hasTag(def, TAG_BOSS))
    attachSomewhere(s, rng, spare, rng.weightedOrder(bossDefs, (def) => def.weight ?? 1), true)

    // Cap spare connectors with dead-end modules where they fit; the rest stay closed (walls)
    const capDefs = kit.modules.filter((def) => hasTag(def, TAG_CAP))
    if (capDefs.length > 0) {
      for (const entry of spare) {
        if (!isFrontierOpen(s, entry)) continue
        const defs = rng.weightedOrder(capDefs, (def) =>
          (s.countsByDef.get(def.id) ?? 0) < (def.maxCount ?? Infinity) ? (def.weight ?? 1) : 0
        )
        tryAttach(s, rng, entry, defs)
      }
    }
    return s
  }

  function requirementsList(): Array<{ tag: string; count: number; deepFirst: boolean }> {
    return (kit.require ?? []).map((r) => ({
      tag: r.tag,
      count: r.count,
      deepFirst: kit.modules.some((def) => hasTag(def, r.tag) && (def.minDepth ?? 0) > 0),
    }))
  }

  function requiredShortfall(s: GrowState): number {
    let n = 0
    for (const r of kit.require ?? []) n += Math.max(0, r.count - countTag(s, r.tag))
    return n
  }

  function countTag(s: GrowState, tag: string): number {
    return s.countsByTag.get(tag) ?? 0
  }

  function growthWeight(s: GrowState, def: ModuleDef, depth: number): number {
    const count = s.countsByDef.get(def.id) ?? 0
    if (count >= (def.maxCount ?? Infinity)) return 0
    if (depth < (def.minDepth ?? 0) || depth > (def.maxDepth ?? Infinity)) return 0
    let weight = def.weight ?? 1
    // Boost defs still short of their minimum or of a required tag
    if (count < (def.minCount ?? 0)) weight *= 3
    else if (def.tags) {
      for (const r of kit.require ?? []) {
        if (def.tags.includes(r.tag) && countTag(s, r.tag) < r.count) {
          weight *= 2
          break
        }
      }
    }
    return weight
  }

  /** True if the connector is unjoined and its neighbour cell is free and inside the grid. */
  function isFrontierOpen(s: GrowState, entry: readonly [number, number]): boolean {
    const conn = s.modules[entry[0]].connectors[entry[1]]
    if (conn.joined >= 0 || conn.exterior) return false
    const [dx, dy, dz] = FACE_DIR[conn.face]
    const tx = conn.cell[0] + dx
    const ty = conn.cell[1] + dy
    const tz = conn.cell[2] + dz
    return grid.inBounds(tx, ty, tz) && s.occupancy[grid.index(tx, ty, tz)] < 0
  }

  /** Attach one of `defs` (in order) at the first fitting spare entry; deepest parents first if `deepFirst`. */
  function attachSomewhere(s: GrowState, rng: DungeonRng, spare: Array<[number, number]>, defs: ModuleDef[], deepFirst: boolean): boolean {
    if (defs.length === 0) return false
    const open = spare.filter((entry) => isFrontierOpen(s, entry))
    if (deepFirst) {
      rng.shuffle(open)
      open.sort((a, b) => s.modules[b[0]].depth - s.modules[a[0]].depth)
    } else {
      rng.shuffle(open)
    }
    for (const entry of open) {
      const depth = s.modules[entry[0]].depth + 1
      const fitting = defs.filter(
        (def) =>
          depth >= (def.minDepth ?? 0) &&
          depth <= (def.maxDepth ?? Infinity) &&
          (s.countsByDef.get(def.id) ?? 0) < (def.maxCount ?? Infinity)
      )
      if (fitting.length === 0) continue
      const placed = tryAttach(s, rng, entry, fitting)
      if (placed) {
        // The new module's own open connectors become spare
        const index = s.modules.length - 1
        s.modules[index].connectors.forEach((c, ci) => {
          if (c.joined < 0 && !c.exterior) spare.push([index, ci])
        })
        return true
      }
    }
    return false
  }

  /** Try each def/rotation/connector against the frontier entry. */
  function tryAttach(s: GrowState, rng: DungeonRng, entry: readonly [number, number], defs: ModuleDef[]): boolean {
    const parent = s.modules[entry[0]]
    const conn = parent.connectors[entry[1]]
    const [dx, dy, dz] = FACE_DIR[conn.face]
    const tx = conn.cell[0] + dx
    const ty = conn.cell[1] + dy
    const tz = conn.cell[2] + dz
    const needFace = oppositeFace(conn.face)
    for (const def of defs) {
      const rotations = rng.shuffle([...(def.rotations ?? [0, 1, 2, 3])])
      for (const r of rotations) {
        const [sw, sh, sd] = rotatedSize(def, r)
        const order = rng.shuffle(def.connectors.map((_, i) => i))
        for (const ci of order) {
          const c = def.connectors[ci]
          if (c.exterior || connectorKind(c) !== conn.kind) continue
          if (rotateFace(c.face, r) !== needFace) continue
          const [rx, rz] = rotateCell(c.cell[0], c.cell[2], def.size[0], def.size[2], r)
          const minX = tx - rx
          const minY = ty - c.cell[1]
          const minZ = tz - rz
          if (!fits(s, def, minX, minY, minZ, sw, sh, sd)) continue
          const index = place(s, def, r, minX, minY, minZ, parent.depth + 1)
          join(s, entry[0], entry[1], index, ci)
          linkNeighbours(s, index)
          return true
        }
      }
    }
    return false
  }

  function fits(s: GrowState, def: ModuleDef, x0: number, y0: number, z0: number, sw: number, sh: number, sd: number): boolean {
    const levels = def.levels ?? kit.levels
    if (y0 < levels[0] || y0 > levels[1]) return false
    const worldBottom = cellMinY(y0)
    const worldTop = cellMinY(y0 + sh) - 1 + (def.overhang?.up ?? 0)
    if (worldBottom < yRange[0] || worldTop > yRange[1]) return false
    for (let y = y0; y < y0 + sh; y++) {
      for (let z = z0; z < z0 + sd; z++) {
        for (let x = x0; x < x0 + sw; x++) {
          if (!grid.inBounds(x, y, z) || s.occupancy[grid.index(x, y, z)] >= 0) return false
        }
      }
    }
    return true
  }

  function place(s: GrowState, def: ModuleDef, r: number, x0: number, y0: number, z0: number, depth: number): number {
    const index = s.modules.length
    const size = rotatedSize(def, r)
    const connectors: PlacedConnector[] = def.connectors.map((c, ci) => {
      const [rx, rz] = rotateCell(c.cell[0], c.cell[2], def.size[0], def.size[2], r)
      return {
        def: c,
        index: ci,
        cell: [x0 + rx, y0 + c.cell[1], z0 + rz] as const,
        face: rotateFace(c.face, r),
        kind: connectorKind(c),
        exterior: c.exterior === true,
        joined: -1,
      }
    })
    const box: Box = {
      x0: cellMinX(x0),
      y0: cellMinY(y0),
      z0: cellMinZ(z0),
      x1: cellMinX(x0 + size[0]) - 1,
      y1: cellMinY(y0 + size[1]) - 1,
      z1: cellMinZ(z0 + size[2]) - 1,
    }
    const o = def.overhang ?? {}
    const side = o.side ?? 0
    const writeBox: Box = {
      x0: box.x0 - side,
      y0: box.y0 - (o.down ?? 0),
      z0: box.z0 - side,
      x1: box.x1 + side,
      y1: box.y1 + (o.up ?? 0),
      z1: box.z1 + side,
    }
    const module: PlacedModule = { index, def, cell: [x0, y0, z0], size, rotation: r, connectors, depth, tier: 0, box, writeBox }
    s.modules.push(module)
    for (let y = y0; y < y0 + size[1]; y++) {
      for (let z = z0; z < z0 + size[2]; z++) {
        for (let x = x0; x < x0 + size[0]; x++) s.occupancy[grid.index(x, y, z)] = index
      }
    }
    s.countsByDef.set(def.id, (s.countsByDef.get(def.id) ?? 0) + 1)
    for (const tag of def.tags ?? []) s.countsByTag.set(tag, (s.countsByTag.get(tag) ?? 0) + 1)
    return index
  }

  function join(s: GrowState, a: number, ac: number, b: number, bc: number): void {
    s.modules[a].connectors[ac].joined = b
    s.modules[b].connectors[bc].joined = a
  }

  function isSealed(def: ModuleDef): boolean {
    return def.tags !== undefined && def.tags.some((tag) => SEALED_TAGS.has(tag))
  }

  /** Join the new module's connectors to matching neighbours (loops); queue its free ones. */
  function linkNeighbours(s: GrowState, index: number): void {
    const module = s.modules[index]
    const sealed = isSealed(module.def)
    module.connectors.forEach((c, ci) => {
      if (c.joined >= 0 || c.exterior) return
      const [dx, dy, dz] = FACE_DIR[c.face]
      const nx = c.cell[0] + dx
      const ny = c.cell[1] + dy
      const nz = c.cell[2] + dz
      if (!grid.inBounds(nx, ny, nz)) return
      const other = s.occupancy[grid.index(nx, ny, nz)]
      if (other < 0) {
        if (!sealed) s.frontier.push([index, ci])
        return
      }
      if (sealed || isSealed(s.modules[other].def)) return
      const need = oppositeFace(c.face)
      const match = s.modules[other].connectors.findIndex(
        (oc) =>
          oc.joined < 0 &&
          !oc.exterior &&
          oc.face === need &&
          oc.kind === c.kind &&
          oc.cell[0] === nx &&
          oc.cell[1] === ny &&
          oc.cell[2] === nz
      )
      if (match >= 0) join(s, index, ci, other, match)
    })
  }

  function placeEntrance(s: GrowState, rng: DungeonRng): boolean {
    const defs = rng.weightedOrder(
      kit.modules.filter((def) => hasTag(def, TAG_ENTRANCE) && def.connectors.some((c) => c.exterior)),
      (def) => def.weight ?? 1
    )
    const sides = rng.shuffle([0, 1, 2, 3])
    for (const def of defs) {
      const ext = def.connectors.find((c) => c.exterior)!
      for (const side of sides) {
        const r = (side - ext.face + 4) % 4
        if (!(def.rotations ?? [0, 1, 2, 3]).includes(r)) continue
        const [sw, sh, sd] = rotatedSize(def, r)
        const [rx, rz] = rotateCell(ext.cell[0], ext.cell[2], def.size[0], def.size[2], r)
        // Exterior connector cell on the grid edge facing out, centred along the edge
        let cx = 0
        let cz = 0
        const R = kit.gridRadius
        if (side === 0) cx = R
        else if (side === 2) cx = -R
        else if (side === 1) cz = R
        else cz = -R
        const levels = def.levels ?? kit.levels
        const y0 = Math.max(levels[0], Math.min(levels[1], -ext.cell[1]))
        const x0 = cx - rx
        const z0 = cz - rz
        if (!fits(s, def, x0, y0, z0, sw, sh, sd)) continue
        const index = place(s, def, r, x0, y0, z0, 0)
        linkNeighbours(s, index)
        return true
      }
    }
    return false
  }

  function scoreState(s: GrowState): number {
    if (s.modules.length === 0) return -1
    computeDepths(s)
    let score = 0
    let complete = true
    for (const r of kit.require ?? []) {
      const have = Math.min(countTag(s, r.tag), r.count)
      score += have * 100
      if (have < r.count) complete = false
    }
    for (const def of kit.modules) {
      if (hasTag(def, TAG_ENTRANCE) || hasTag(def, TAG_BOSS)) continue
      const need = def.minCount ?? 0
      const have = Math.min(s.countsByDef.get(def.id) ?? 0, need)
      score += have * 100
      if (have < need) complete = false
    }
    const boss = s.modules.find((m) => hasTag(m.def, TAG_BOSS))
    if (!boss) return score
    score += 10000
    let maxOther = 0
    for (const m of s.modules) if (m !== boss) maxOther = Math.max(maxOther, m.depth)
    const fraction = kit.bossDepthFraction ?? DEFAULTS.bossDepthFraction
    if (boss.depth < fraction * maxOther) complete = false
    score += boss.depth * 10 + Math.min(s.modules.length, kit.targetModules[0])
    return complete && s.modules.length >= Math.min(kit.targetModules[0], 4) ? score + 1e6 : score
  }

  /** BFS path depth from the entrance over joined connectors. */
  function computeDepths(s: GrowState): void {
    for (const m of s.modules) m.depth = Infinity
    const queue = [0]
    s.modules[0].depth = 0
    while (queue.length > 0) {
      const i = queue.shift()!
      for (const c of s.modules[i].connectors) {
        if (c.joined < 0) continue
        const next = s.modules[c.joined]
        if (next.depth > s.modules[i].depth + 1) {
          next.depth = s.modules[i].depth + 1
          queue.push(c.joined)
        }
      }
    }
    for (const m of s.modules) if (!Number.isFinite(m.depth)) m.depth = 0
  }

  function finishLayout(s: GrowState, attempts: number, usedFallback: boolean): DungeonLayout {
    computeDepths(s)
    let maxDepth = 0
    for (const m of s.modules) maxDepth = Math.max(maxDepth, m.depth)

    const occupancy = s.occupancy
    const info: LayoutInfo = {
      kitId: kit.id,
      seed,
      salt,
      anchorX,
      anchorZ,
      baseY,
      originX,
      originZ,
      cellSize: cs,
      floorHeight: fh,
      modules: s.modules,
      maxDepth,
      moduleAt: (cx, level, cz) => (grid.inBounds(cx, level, cz) ? occupancy[grid.index(cx, level, cz)] : -1),
    }
    for (const m of s.modules) {
      m.tier = kit.tierFor ? clampTier(kit.tierFor(m, info)) : defaultTier(m, maxDepth)
    }

    // Bounds: module write boxes + pass box
    const margin = kit.exteriorMargin ?? DEFAULTS.exteriorMargin
    let fx0 = Infinity, fz0 = Infinity, fx1 = -Infinity, fz1 = -Infinity
    let my0 = Infinity, my1 = -Infinity
    for (const m of s.modules) {
      fx0 = Math.min(fx0, m.box.x0)
      fz0 = Math.min(fz0, m.box.z0)
      fx1 = Math.max(fx1, m.box.x1)
      fz1 = Math.max(fz1, m.box.z1)
      my0 = Math.min(my0, m.box.y0)
      my1 = Math.max(my1, m.box.y1)
    }
    if (s.modules.length === 0) {
      fx0 = fx1 = anchorX
      fz0 = fz1 = anchorZ
      my0 = my1 = baseY
    }
    const passBox: Box = {
      x0: fx0 - margin,
      y0: Math.min(my0, baseY) - (kit.foundationDepth ?? DEFAULTS.foundationDepth),
      z0: fz0 - margin,
      x1: fx1 + margin,
      y1: my1 + (kit.exteriorHeight ?? DEFAULTS.exteriorHeight),
      z1: fz1 + margin,
    }
    const bounds: Box = { ...passBox }
    for (const m of s.modules) {
      bounds.x0 = Math.min(bounds.x0, m.writeBox.x0)
      bounds.y0 = Math.min(bounds.y0, m.writeBox.y0)
      bounds.z0 = Math.min(bounds.z0, m.writeBox.z0)
      bounds.x1 = Math.max(bounds.x1, m.writeBox.x1)
      bounds.y1 = Math.max(bounds.y1, m.writeBox.y1)
      bounds.z1 = Math.max(bounds.z1, m.writeBox.z1)
    }

    // Entrance: just outside its exterior opening, at floor+1
    const entranceModule = s.modules[0]
    const ext = entranceModule?.connectors.find((c) => c.exterior)
    let entrance = { module: 0, x: anchorX, y: baseY + 1, z: anchorZ, face: 1 as Face }
    if (ext) {
      const [dx, , dz] = FACE_DIR[ext.face]
      const half = Math.floor(cs / 2)
      const ex = cellMinX(ext.cell[0]) + (dx > 0 ? cs : dx < 0 ? -1 : half)
      const ez = cellMinZ(ext.cell[2]) + (dz > 0 ? cs : dz < 0 ? -1 : half)
      entrance = { module: 0, x: ex, y: cellMinY(ext.cell[1]) + 1, z: ez, face: ext.face }
    }

    const markers: DungeonMarker[] = []
    const layout: DungeonLayout = {
      ...info,
      bounds,
      passBox,
      entrance,
      boss: null,
      markers,
      attempts,
      fallback: usedFallback,
      genMs: 0,
    }

    // Dry run: every builder and pass once, recording markers (no writes)
    runPass(layout, kit, 'foundation', null, null, terrainHeight, markers)
    for (const m of s.modules) {
      const ctx = buildModuleContext(layout, kit, m, null, null, terrainHeight, markers)
      m.def.build(ctx)
    }
    runPass(layout, kit, 'exterior', null, null, terrainHeight, markers)

    const guardian = markers.find((mk) => mk.type === 'guardian')
    const bossModule = s.modules.find((m) => hasTag(m.def, TAG_BOSS))
    const boss = guardian
      ? { x: guardian.x, y: guardian.y, z: guardian.z }
      : bossModule
        ? {
            x: Math.floor((bossModule.box.x0 + bossModule.box.x1) / 2),
            y: bossModule.box.y0 + 1,
            z: Math.floor((bossModule.box.z0 + bossModule.box.z1) / 2),
          }
        : null
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return { ...layout, boss, genMs: ended - started }
  }
}

function clampTier(tier: number): number {
  return Math.max(0, Math.min(3, Math.round(tier)))
}

function defaultTier(m: PlacedModule, maxDepth: number): number {
  if (hasTag(m.def, TAG_BOSS)) return 3
  const base = Math.min(2, Math.floor((3 * m.depth) / (maxDepth + 1)))
  return hasTag(m.def, 'vault') ? Math.min(3, base + 1) : base
}
