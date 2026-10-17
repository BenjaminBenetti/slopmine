import { BlockIds } from '../../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../../interfaces/IChunk.ts'
import type { IChunkData } from '../../../interfaces/IChunkData.ts'
import type { ISubChunkCoordinate } from '../../../interfaces/ICoordinates.ts'
import { emberHash01 } from './emberHash.ts'

/**
 * Giant hell-fungus geometry for the Ember Grove (giant and medium fungi,
 * and the colossal fungus crowning the Sporeheart Hive).
 *
 * Everything here is a pure function of the fungus parameters (themselves a
 * pure function of the root's world position and the seed), evaluated per
 * world cell, so every chunk and sub-chunk renders an identical slice of the
 * same fungus - no floating cap fragments at chunk seams.
 *
 * Overlapping fungi resolve by block PRECEDENCE, not by placement order:
 * a cell takes the highest-precedence fungus block any fungus wants there
 * (stem > cap > gills > spore sac > shelf > strand > air), and never
 * replaces terrain or structures. The result is independent of the order
 * fungi are visited, which differs between neighbouring chunks.
 */

/** Shelf fungi around the stem: none, a climbable spiral, or a few brackets. */
export type ShelfStyle = 'none' | 'spiral' | 'scattered'

export interface FungusParams {
  /** Root cell (world X/Z of the stem's base cell). */
  readonly rootX: number
  readonly rootZ: number
  /** First stem cell Y (the cell above the ground). */
  readonly baseY: number
  /** Stem length from baseY to the cap rim. */
  readonly stemHeight: number
  /** Stem radius at the base / under the cap (blocks, float). */
  readonly baseRadius: number
  readonly topRadius: number
  /** Horizontal offset of the stem top from the root (curved lean). */
  readonly leanX: number
  readonly leanZ: number
  /** Cap radius (blocks) and dome rise of its top above the rim. */
  readonly capRadius: number
  readonly capRise: number
  /** Shell thickness of the cap (blocks). */
  readonly capThickness: number
  /** Root-flare lobes at the base. */
  readonly flareLobes: number
  readonly flarePhase: number
  readonly flareAmount: number
  /** Cap outline wobble phases. */
  readonly lobePhaseA: number
  readonly lobePhaseB: number
  readonly shelves: ShelfStyle
  readonly shelfPhase: number
  /** +1 / -1: spiral direction. */
  readonly shelfTurn: number
  /** Chance per cap column of a hanging spore strand, and its max length. */
  readonly strandChance: number
  readonly strandMaxLength: number
  /** Chance per cap column of a hanging spore sac (hive crown only). */
  readonly sacChance: number
  /** Chance per cap column of a glowing spore sac in the cap's top skin (hive crown only). */
  readonly capSacChance?: number
  /**
   * Fraction of gill cells that cast real block light (EMBER_GILLS_LIT); the
   * rest glow through their emissive texture only. Default 0.1.
   */
  readonly gillLightChance?: number
  /** Hash salt for per-cell rolls (distinct per fungus). */
  readonly salt: number
  readonly seed: number
}

/** Fungus block precedence (higher wins; anything unlisted is never replaced). */
const PRECEDENCE = new Map<number, number>([
  [BlockIds.AIR, 0],
  [BlockIds.SPORE_STRAND, 1],
  [BlockIds.SHELF_FUNGUS, 2],
  [BlockIds.SPORE_SAC, 3],
  [BlockIds.EMBER_GILLS, 4],
  [BlockIds.EMBER_GILLS_LIT, 5],
  [BlockIds.EMBER_CAP, 6],
  [BlockIds.EMBERWOOD_STEM, 7],
])

/**
 * Write window onto one sub-chunk in world coordinates.
 */
export class SubChunkWindow {
  readonly chunkX: number
  readonly chunkZ: number
  readonly minY: number
  readonly maxY: number

  constructor(readonly chunk: IChunkData) {
    const coord = chunk.coordinate as ISubChunkCoordinate
    const subY = typeof coord.subY === 'number' ? coord.subY : 0
    this.chunkX = Number(coord.x) * CHUNK_SIZE_X
    this.chunkZ = Number(coord.z) * CHUNK_SIZE_Z
    this.minY = subY * SUB_CHUNK_HEIGHT
    this.maxY = this.minY + SUB_CHUNK_HEIGHT - 1
  }

  /** True if the world cell lies in this sub-chunk. */
  contains(x: number, y: number, z: number): boolean {
    return (
      y >= this.minY && y <= this.maxY &&
      x >= this.chunkX && x < this.chunkX + CHUNK_SIZE_X &&
      z >= this.chunkZ && z < this.chunkZ + CHUNK_SIZE_Z
    )
  }

  get(x: number, y: number, z: number): number {
    return this.chunk.getBlockId(x - this.chunkX, y - this.minY, z - this.chunkZ)
  }

  /** Unconditional write (caller checked contains()). */
  set(x: number, y: number, z: number, id: number): void {
    this.chunk.setBlockId(x - this.chunkX, y - this.minY, z - this.chunkZ, id)
  }

  /** Set block metadata where the chunk supports it (worker sub-chunks do). */
  setMetadata(x: number, y: number, z: number, value: number): void {
    const target = this.chunk as unknown as { setMetadata?: (x: number, y: number, z: number, v: number) => boolean }
    target.setMetadata?.(x - this.chunkX, y - this.minY, z - this.chunkZ, value)
  }

  /** Precedence write for fungus blocks (see PRECEDENCE). */
  writeFungus(x: number, y: number, z: number, id: number): void {
    if (!this.contains(x, y, z)) return
    const current = this.get(x, y, z)
    if (current === id) return
    const currentRank = PRECEDENCE.get(current)
    if (currentRank === undefined) return
    if ((PRECEDENCE.get(id) ?? 0) > currentRank) this.set(x, y, z, id)
  }
}

/** Horizontal reach of a fungus from its root (blocks), for search radii. */
export function fungusReach(p: FungusParams): number {
  const lean = Math.hypot(p.leanX, p.leanZ)
  const capReach = lean + p.capRadius * 1.11 + 1.5
  const stemReach = lean + p.baseRadius + p.flareAmount + 3
  return Math.ceil(Math.max(capReach, stemReach))
}

/** Topmost cell Y a fungus can occupy. */
export function fungusTopY(p: FungusParams): number {
  return p.baseY + p.stemHeight + Math.ceil(p.capRise) + 1
}

/** Lowest cell Y a fungus can occupy (root fill below uneven ground). */
export function fungusBottomY(p: FungusParams): number {
  return p.baseY - 16
}

const TAU = Math.PI * 2

function angleDelta(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return Math.abs(d)
}

/**
 * Render the slice of one fungus that falls inside `win`.
 * @param groundAt Terrain surface height (top solid block Y) at a column -
 *   roots fill down to it so stems never float on slopes.
 */
export function placeFungus(win: SubChunkWindow, p: FungusParams, groundAt: (x: number, z: number) => number): void {
  if (fungusTopY(p) < win.minY || fungusBottomY(p) > win.maxY) return
  const reach = fungusReach(p)
  const rootCX = p.rootX + 0.5
  const rootCZ = p.rootZ + 0.5
  if (
    rootCX + reach < win.chunkX || rootCX - reach > win.chunkX + CHUNK_SIZE_X ||
    rootCZ + reach < win.chunkZ || rootCZ - reach > win.chunkZ + CHUNK_SIZE_Z
  ) {
    return
  }

  placeStem(win, p, groundAt)
  placeShelves(win, p)
  placeCap(win, p)
}

/** Stem centre offset at a height along the stem (gentle curved lean). */
function stemCenter(p: FungusParams, dy: number): { x: number; z: number } {
  const t = Math.min(1, Math.max(0, dy / p.stemHeight))
  const k = t * t
  return { x: p.rootX + 0.5 + p.leanX * k, z: p.rootZ + 0.5 + p.leanZ * k }
}

function stemRadius(p: FungusParams, dy: number): number {
  const t = Math.min(1, Math.max(0, dy / p.stemHeight))
  return p.topRadius + (p.baseRadius - p.topRadius) * Math.pow(1 - t, 1.5)
}

function placeStem(win: SubChunkWindow, p: FungusParams, groundAt: (x: number, z: number) => number): void {
  // The stem runs up into the cap so the two always connect
  const stemTop = p.stemHeight + Math.max(1, Math.floor(p.capRise) - p.capThickness)

  // Base ring (dy 0, widest flare): every column fills from its own ground
  // up to the base, so stems root into slopes instead of floating
  if (fungusBottomY(p) <= win.maxY) {
    forStemDisk(win, p, 0, (x, z) => {
      const from = Math.max(groundAt(x, z) + 1, win.minY)
      const to = Math.min(p.baseY, win.maxY)
      for (let y = from; y <= to; y++) win.writeFungus(x, y, z, BlockIds.EMBERWOOD_STEM)
    })
  }

  const dyFrom = Math.max(1, win.minY - p.baseY)
  const dyTo = Math.min(stemTop, win.maxY - p.baseY)
  for (let dy = dyFrom; dy <= dyTo; dy++) {
    const y = p.baseY + dy
    forStemDisk(win, p, dy, (x, z) => win.writeFungus(x, y, z, BlockIds.EMBERWOOD_STEM))
  }
}

/** Visit the stem cross-section cells (in this chunk) at a height along the stem. */
function forStemDisk(win: SubChunkWindow, p: FungusParams, dy: number, visit: (x: number, z: number) => void): void {
  const flareTop = 3.5
  const c = stemCenter(p, dy)
  const r = stemRadius(p, dy)
  const flare = dy < flareTop ? p.flareAmount * (1 - dy / flareTop) : 0
  const maxR = r + flare + 0.5
  const x0 = Math.max(win.chunkX, Math.floor(c.x - maxR))
  const x1 = Math.min(win.chunkX + CHUNK_SIZE_X - 1, Math.floor(c.x + maxR))
  const z0 = Math.max(win.chunkZ, Math.floor(c.z - maxR))
  const z1 = Math.min(win.chunkZ + CHUNK_SIZE_Z - 1, Math.floor(c.z + maxR))
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const ddx = x + 0.5 - c.x
      const ddz = z + 0.5 - c.z
      // ≥ 0.8 so a thin, leaning stem never falls between cell centres
      let limit = Math.max(r, 0.8)
      if (flare > 0) {
        const lobe = Math.pow(0.5 + 0.5 * Math.cos(p.flareLobes * (Math.atan2(ddz, ddx) - p.flarePhase)), 3)
        limit = r + flare * lobe
      }
      if (ddx * ddx + ddz * ddz > limit * limit) continue
      visit(x, z)
    }
  }
}

function placeShelves(win: SubChunkWindow, p: FungusParams): void {
  if (p.shelves === 'none') return

  const brackets: Array<{ dy: number; angle: number; width: number; depth: number }> = []
  if (p.shelves === 'spiral') {
    // One block up per step, ~46 degrees around: a climbable fungus staircase
    for (let k = 0; ; k++) {
      const dy = 2 + k
      if (dy > p.stemHeight - 3) break
      brackets.push({ dy, angle: p.shelfPhase + p.shelfTurn * k * 0.8, width: 0.52, depth: 1.9 })
    }
  } else {
    const count = 2 + Math.floor(emberHash01(p.rootX, p.rootZ, p.salt + 70, p.seed) * 3)
    for (let k = 0; k < count; k++) {
      const h = emberHash01(p.rootX + k * 31, p.rootZ - k * 17, p.salt + 71, p.seed)
      const a = emberHash01(p.rootX - k * 13, p.rootZ + k * 29, p.salt + 72, p.seed)
      const s = emberHash01(p.rootX + k * 7, p.rootZ + k * 11, p.salt + 73, p.seed)
      brackets.push({
        dy: 3 + Math.floor(h * Math.max(1, p.stemHeight - 7)),
        angle: a * TAU,
        width: 0.45 + s * 0.3,
        depth: 1.4 + s * 1.1,
      })
    }
  }

  for (const b of brackets) {
    const y = p.baseY + b.dy
    if (y < win.minY || y > win.maxY) continue
    const c = stemCenter(p, b.dy)
    const r = stemRadius(p, b.dy)
    const outer = r + b.depth
    // On thin stems a diagonal bracket would touch the stem only at an edge:
    // snap it to a face direction
    const angle = r < 1.6 ? Math.round(b.angle / (Math.PI / 2)) * (Math.PI / 2) : b.angle
    const x0 = Math.floor(c.x - outer)
    const x1 = Math.floor(c.x + outer)
    const z0 = Math.floor(c.z - outer)
    const z1 = Math.floor(c.z + outer)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const ddx = x + 0.5 - c.x
        const ddz = z + 0.5 - c.z
        const d = Math.hypot(ddx, ddz)
        // Start just inside the stem surface (the stem keeps its cells by
        // precedence) so every bracket shares a face with the stem
        if (d <= r - 1 || d > outer) continue
        if (angleDelta(Math.atan2(ddz, ddx), angle) > b.width) continue
        win.writeFungus(x, y, z, BlockIds.SHELF_FUNGUS)
      }
    }
  }
}

function placeCap(win: SubChunkWindow, p: FungusParams): void {
  const rimY = p.baseY + p.stemHeight
  const topY = (r: number, R: number): number => rimY + p.capRise * (1 - (r / R) * (r / R))
  if (rimY + Math.ceil(p.capRise) + 1 < win.minY) return
  if (rimY - p.capThickness - 2 - p.strandMaxLength > win.maxY) return

  const capCX = p.rootX + 0.5 + p.leanX
  const capCZ = p.rootZ + 0.5 + p.leanZ
  const maxR = p.capRadius * 1.11 + 0.5
  const x0 = Math.max(win.chunkX, Math.floor(capCX - maxR))
  const x1 = Math.min(win.chunkX + CHUNK_SIZE_X - 1, Math.floor(capCX + maxR))
  const z0 = Math.max(win.chunkZ, Math.floor(capCZ - maxR))
  const z1 = Math.min(win.chunkZ + CHUNK_SIZE_Z - 1, Math.floor(capCZ + maxR))

  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const ddx = x + 0.5 - capCX
      const ddz = z + 0.5 - capCZ
      const r = Math.hypot(ddx, ddz)
      const phi = Math.atan2(ddz, ddx)
      const R = p.capRadius * (1 + 0.06 * Math.sin(3 * phi + p.lobePhaseA) + 0.04 * Math.sin(5 * phi + p.lobePhaseB))
      if (r > R) continue

      const colTop = Math.floor(topY(r, R))
      const nextTop = Math.floor(topY(Math.min(r + 1, R), R))
      // Reach down to the next ring's top so neighbouring columns share a face
      let colBottom = Math.min(colTop - p.capThickness + 1, nextTop)
      const atRim = r > R - 1
      if (atRim) colBottom -= 1 // drooping lip
      const gillUnderside = !atRim && r > p.topRadius - 0.5

      // Light-casting gills: a sparse, seed-only per-cell pick (a shared salt, so
      // overlapping fungi agree on the cell)
      const gillId = emberHash01(x, z, 9401, p.seed) < (p.gillLightChance ?? 0.1) ? BlockIds.EMBER_GILLS_LIT : BlockIds.EMBER_GILLS
      const topSac = (p.capSacChance ?? 0) > 0 && emberHash01(x, z, p.salt + 93, p.seed) < (p.capSacChance ?? 0)
      for (let y = Math.max(colBottom, win.minY); y <= Math.min(colTop, win.maxY); y++) {
        let id = y === colBottom && gillUnderside ? gillId : BlockIds.EMBER_CAP
        if (y === colTop && topSac) id = BlockIds.SPORE_SAC
        win.writeFungus(x, y, z, id)
      }

      // Hanging spore strands / sacs under the gills
      if (!gillUnderside || r < p.topRadius + 1.5 || r > R - 1.5) continue
      const roll = emberHash01(x, z, p.salt + 90, p.seed)
      if (roll < p.sacChance) {
        const len = 1 + Math.floor(emberHash01(x, z, p.salt + 91, p.seed) * 2)
        for (let i = 1; i <= len; i++) win.writeFungus(x, colBottom - i, z, BlockIds.SPORE_SAC)
      } else if (roll < p.sacChance + p.strandChance) {
        const len = 1 + Math.floor(emberHash01(x, z, p.salt + 92, p.seed) * p.strandMaxLength)
        for (let i = 1; i <= len; i++) win.writeFungus(x, colBottom - i, z, BlockIds.SPORE_STRAND)
      }
    }
  }
}
