import { BlockIds } from '../../../blocks/BlockIds.ts'
import { hashInts } from '../../dungeons/DungeonRandom.ts'
import type { CaveBiomeSample } from '../CaveBiomes.ts'
import { MAX_LAVA_LEVEL } from '../CaveDressing.ts'
import { POI_KINDS, type PoiEnvironment, type PoiKindId } from './PoiCatalog.ts'
import type { PoiBuildDef, PoiSite } from './PoiBuilder.ts'

/**
 * Side of a placement cell (blocks). 512-block biome regions hold 8×8 cells,
 * so a cell - and the site inside it - never straddles a region: every
 * chunk that generates part of a site sees the same biome blend, cave
 * samples and heights, and resolves the same site. A 32-block chunk lies in
 * exactly one cell.
 */
export const POI_CELL = 64
/** Chance a cell holds a point of interest (some then find no cave floor and stay empty). */
export const POI_CHANCE = 0.38
const SALT = 0x5f0c1e
/** Lowest anchor (the cave floor fade and the Hell ceiling band, Y 140-143, lie below). */
const MIN_FLOOR_Y = 152
/** Lowest cell a site may write. */
const MIN_WRITE_Y = 147
/** The anchor and the top of the site stay this far under the surface. */
const SURFACE_CLEARANCE = 10
/** Cave floor columns tried per cell. */
const CANDIDATES = 6
/** Open cells needed above a floor for an anchor. */
const HEADROOM = 3
/** The cave probe reaches this far past the site's box (flooded caves must keep clear of it). */
const PROBE_MARGIN = 2

/** What the resolver needs from the generator (the worker's per-chunk closures). */
export interface PoiSiteContext {
  readonly seed: number
  /** Blended surface height at a world column. */
  getHeight(x: number, z: number): number
  /** The carved caves over a box (CaveCarver.probeRegion). */
  probe(x0: number, y0: number, z0: number, sizeX: number, sizeY: number, sizeZ: number): Uint16Array
  /** Surface biome name over a column. */
  surfaceBiomeAt(x: number, z: number): string
  /** Cave zone at a column. */
  caveBiomeAt(x: number, z: number, out: CaveBiomeSample): CaveBiomeSample
}

function rand(cellX: number, cellZ: number, seed: number, salt: number): number {
  return hashInts(cellX, cellZ, seed ^ SALT, salt) / 4294967296
}

/** The kind for a cell: a weighted roll over the catalog in this environment. */
function pickKind(env: PoiEnvironment, roll: number, defs: ReadonlyMap<PoiKindId, PoiBuildDef>): PoiBuildDef | null {
  let total = 0
  for (const kind of POI_KINDS) if (defs.has(kind.id)) total += Math.max(0, kind.weight(env))
  if (total <= 0) return null
  let r = roll * total
  for (const kind of POI_KINDS) {
    if (!defs.has(kind.id)) continue
    r -= Math.max(0, kind.weight(env))
    if (r < 0) return defs.get(kind.id)!
  }
  return null
}

const sample: CaveBiomeSample = { biome: null, strength: 0 }
const cache = new Map<string, PoiSite | null>()
const CACHE_SIZE = 48

/**
 * The point of interest of a placement cell, or null: a pure function of the
 * cell, the seed and the world's caves, cached per worker. The kind is rolled
 * from the surroundings (surface biome, cave zone); its anchor is a cave floor
 * with headroom in one of a few hashed columns, deep enough under the
 * surface for the whole site and clear of flooded caves and magma chamber
 * lava. The site faces its most open side.
 */
export function poiSiteForCell(
  cellX: number,
  cellZ: number,
  ctx: PoiSiteContext,
  defs: ReadonlyMap<PoiKindId, PoiBuildDef>
): PoiSite | null {
  const key = `${ctx.seed}:${cellX},${cellZ}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    // Refresh the entry (least recently used goes first)
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }
  const site = resolveSite(cellX, cellZ, ctx, defs)
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(key, site)
  return site
}

function resolveSite(cellX: number, cellZ: number, ctx: PoiSiteContext, defs: ReadonlyMap<PoiKindId, PoiBuildDef>): PoiSite | null {
  const seed = ctx.seed
  if (rand(cellX, cellZ, seed, 1) >= POI_CHANCE) return null
  const centreX = cellX * POI_CELL + POI_CELL / 2
  const centreZ = cellZ * POI_CELL + POI_CELL / 2
  ctx.caveBiomeAt(centreX, centreZ, sample)
  const env: PoiEnvironment = {
    surfaceBiome: ctx.surfaceBiomeAt(centreX, centreZ),
    caveBiome: sample.strength >= 0.5 ? sample.biome : null,
  }
  const def = pickKind(env, rand(cellX, cellZ, seed, 2), defs)
  if (!def) return null
  const r = def.radius
  const margin = r + 1
  const span = Math.max(1, POI_CELL - 2 * margin)

  for (let attempt = 0; attempt < CANDIDATES; attempt++) {
    const x = cellX * POI_CELL + margin + Math.floor(rand(cellX, cellZ, seed, 10 + attempt * 2) * span)
    const z = cellZ * POI_CELL + margin + Math.floor(rand(cellX, cellZ, seed, 11 + attempt * 2) * span)
    const surface = ctx.getHeight(x, z)
    const yMin = Math.max(MIN_FLOOR_Y, MIN_WRITE_Y + def.below)
    const yMax = surface - SURFACE_CLEARANCE - def.above
    if (yMax < yMin) continue

    // Cave floors with headroom in this column
    const y0 = yMin - 1
    const column = ctx.probe(x, y0, z, 1, yMax - y0 + HEADROOM + 1, 1)
    const floors: number[] = []
    for (let y = yMin; y <= yMax; y++) {
      if (column[y - 1 - y0] !== BlockIds.STONE) continue
      let open = true
      for (let h = 0; h < HEADROOM && open; h++) open = column[y + h - y0] === BlockIds.AIR
      if (open) floors.push(y)
    }
    if (floors.length === 0) continue
    const y = floors[Math.floor(rand(cellX, cellZ, seed, 40 + attempt) * floors.length)]

    // Magma chambers flood their low caves with lava (CaveDressing): stay above it
    ctx.caveBiomeAt(x, z, sample)
    if (sample.biome === 'magma_chamber' && sample.strength > 0 && y - def.below <= MAX_LAVA_LEVEL + 1) continue

    const box = { x0: x - r, y0: y - def.below, z0: z - r, x1: x + r, y1: y + def.above, z1: z + r }
    // The whole site stays under the surface
    let buried = true
    for (const [cx, cz] of [[box.x0, box.z0], [box.x1, box.z0], [box.x0, box.z1], [box.x1, box.z1]]) {
      if (ctx.getHeight(cx, cz) < box.y1 + 4) buried = false
    }
    if (!buried) continue

    // Probe a little beyond the box: a flooded cave just outside it would pour in through a carved wall
    const probeBox = { x0: box.x0 - PROBE_MARGIN, y0: box.y0 - PROBE_MARGIN, z0: box.z0 - PROBE_MARGIN, x1: box.x1 + PROBE_MARGIN, y1: box.y1 + PROBE_MARGIN, z1: box.z1 + PROBE_MARGIN }
    const sizeX = probeBox.x1 - probeBox.x0 + 1
    const sizeY = probeBox.y1 - probeBox.y0 + 1
    const probe = ctx.probe(probeBox.x0, probeBox.y0, probeBox.z0, sizeX, sizeY, sizeX)
    // Never next to flooded caves (lava, swamp water): opening them would let them flow
    let dry = true
    for (let i = 0; i < probe.length && dry; i++) dry = probe[i] === BlockIds.STONE || probe[i] === BlockIds.AIR
    if (!dry) continue

    return {
      def,
      x, y, z,
      rotation: openestSide(probe, sizeX, sizeY, r + PROBE_MARGIN, y - probeBox.y0, rand(cellX, cellZ, seed, 60)),
      seed: hashInts(cellX, cellZ, seed, SALT) | 0,
      box,
      probe,
      probeBox,
      surfaceAt: (wx: number, wz: number) => ctx.getHeight(wx, wz),
    }
  }
  return null
}

/**
 * The rotation whose forward side (local +Z) has the most cave air in a
 * wedge around the anchor, at foot to head height: sites open toward the
 * cave they were found in.
 */
function openestSide(probe: Uint16Array, size: number, sizeY: number, r: number, anchorY: number, tieBreak: number): number {
  // Forward vectors for rotations 0-3: +Z, -X, -Z, +X
  const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]]
  const start = Math.floor(tieBreak * 4)
  let best = start
  let bestCount = -1
  for (let k = 0; k < 4; k++) {
    const rot = (start + k) % 4
    const [fx, fz] = dirs[rot]
    let count = 0
    for (let d = 2; d <= r; d++) {
      for (let s = -d; s <= d; s++) {
        const px = r + fx * d + fz * s
        const pz = r + fz * d - fx * s
        if (px < 0 || pz < 0 || px >= size || pz >= size) continue
        for (let y = anchorY; y < Math.min(sizeY, anchorY + 3); y++) {
          if (probe[(y * size + pz) * size + px] === BlockIds.AIR) count++
        }
      }
    }
    if (count > bestCount) {
      bestCount = count
      best = rot
    }
  }
  return best
}
