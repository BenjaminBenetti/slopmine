import type { FeatureContext } from '../Feature.ts'
import type { IChunkData } from '../../../interfaces/IChunkData.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../../interfaces/IChunk.ts'
import type { ISubChunkCoordinate } from '../../../interfaces/ICoordinates.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { abyssFloorHeight } from '../../crystal/CrystalAbyssShape.ts'

/**
 * Shared helpers for the Crystal Abyss worker features.
 *
 * Every feature follows the cross-chunk rules of the worker pipeline: a
 * world-anchored placement grid, every decision a pure function of world
 * coordinates and the seed, and per-sub-chunk clipping on write. A feature
 * only ever writes cells of the sub-chunk it runs for, so every slice of a
 * structure is rendered by the chunk that owns it.
 */

/** World-space bounds of the sub-chunk a feature is running for. */
export interface SubChunkBounds {
  readonly chunk: IChunkData
  readonly minX: number
  readonly minZ: number
  readonly minY: number
  readonly maxY: number
}

export function getSubChunkBounds(chunk: IChunkData): SubChunkBounds {
  const coord = chunk.coordinate as ISubChunkCoordinate
  const subY = typeof coord.subY === 'number' ? coord.subY : 0
  const minY = subY * SUB_CHUNK_HEIGHT
  return {
    chunk,
    minX: Number(coord.x) * CHUNK_SIZE_X,
    minZ: Number(coord.z) * CHUNK_SIZE_Z,
    minY,
    maxY: minY + SUB_CHUNK_HEIGHT - 1,
  }
}

/** Is the world cell inside this sub-chunk? */
export function contains(b: SubChunkBounds, x: number, y: number, z: number): boolean {
  return (
    x >= b.minX && x < b.minX + CHUNK_SIZE_X &&
    z >= b.minZ && z < b.minZ + CHUNK_SIZE_Z &&
    y >= b.minY && y <= b.maxY
  )
}

/** Read a world cell (caller guarantees it is inside the sub-chunk). */
export function getAt(b: SubChunkBounds, x: number, y: number, z: number): number {
  return b.chunk.getBlockId(x - b.minX, y - b.minY, z - b.minZ)
}

/** Write a world cell (caller guarantees it is inside the sub-chunk). */
export function setAt(b: SubChunkBounds, x: number, y: number, z: number, id: number): void {
  b.chunk.setBlockId(x - b.minX, y - b.minY, z - b.minZ, id)
}

/** Write block metadata (worker sub-chunks only; no-op elsewhere). */
export function setMetadataAt(b: SubChunkBounds, x: number, y: number, z: number, value: number): void {
  const chunk = b.chunk as IChunkData & { setMetadata?: (x: number, y: number, z: number, v: number) => boolean }
  chunk.setMetadata?.(x - b.minX, y - b.minY, z - b.minZ, value)
}

/** Blocks the Crystal Abyss landmarks may grow through (air and bare terrain). */
export function isOpenOrTerrain(id: number): boolean {
  return (
    id === BlockIds.AIR ||
    id === BlockIds.ABYSSAL_STONE ||
    id === BlockIds.GLITTERING_ABYSSAL_STONE
  )
}

/** The shaped Crystal Abyss floor (top solid Y) at a column. */
export function floorAt(context: FeatureContext, x: number, z: number): number {
  return abyssFloorHeight(context.noise, x, z, context.getBaseHeightAt(x, z))
}

/**
 * True when the square of half-size `radius` (plus the border dither band)
 * around (x, z) lies entirely in regions of this feature's biome. Regions are
 * axis-aligned 512-block squares, so the four corners (and the center)
 * decide it for any radius below 256. Pure: every slice agrees.
 */
export function footprintInOwnBiome(context: FeatureContext, x: number, z: number, radius: number): boolean {
  const getBiomeNameAt = context.getBiomeNameAt
  if (!getBiomeNameAt) return true
  const owner = context.biomeProperties.name
  const r = radius + 16 // + max reach of border dithering
  return (
    getBiomeNameAt(x, z) === owner &&
    getBiomeNameAt(x - r, z - r) === owner &&
    getBiomeNameAt(x + r, z - r) === owner &&
    getBiomeNameAt(x - r, z + r) === owner &&
    getBiomeNameAt(x + r, z + r) === owner
  )
}

/**
 * World-anchored grid cells whose structures (reaching up to `reach` blocks
 * from anything in their cell) can touch this chunk. Calls visit(cellX, cellZ)
 * with the cell's minimum-corner world coordinates.
 */
export function forEachGridCell(
  b: SubChunkBounds,
  gridSize: number,
  reach: number,
  visit: (cellX: number, cellZ: number) => void
): void {
  const firstX = Math.floor((b.minX - reach) / gridSize) * gridSize
  const lastX = b.minX + CHUNK_SIZE_X - 1 + reach
  const firstZ = Math.floor((b.minZ - reach) / gridSize) * gridSize
  const lastZ = b.minZ + CHUNK_SIZE_Z - 1 + reach
  for (let cx = firstX; cx <= lastX; cx += gridSize) {
    for (let cz = firstZ; cz <= lastZ; cz += gridSize) {
      visit(cx, cz)
    }
  }
}

/**
 * Rasterize a tapered crystal shard (a cone-capped cylinder along an axis)
 * into the sub-chunk. `pick` chooses the block for each covered cell (or -1
 * to skip); cells are only written where `canReplace` allows.
 *
 * @param sx, sy, sz Axis start (world, may be below ground)
 * @param dx, dy, dz Unit axis direction
 * @param length Axis length
 * @param radius Radius at the base
 * @param tipFraction Fraction of the length that tapers to the point
 */
export function rasterizeShard(
  b: SubChunkBounds,
  sx: number, sy: number, sz: number,
  dx: number, dy: number, dz: number,
  length: number,
  radius: number,
  tipFraction: number,
  pick: (x: number, y: number, z: number, along: number) => number,
  canReplace: (id: number) => boolean = isOpenOrTerrain
): void {
  const ex = sx + dx * length
  const ey = sy + dy * length
  const ez = sz + dz * length
  const x0 = Math.max(b.minX, Math.floor(Math.min(sx, ex) - radius - 1))
  const x1 = Math.min(b.minX + CHUNK_SIZE_X - 1, Math.ceil(Math.max(sx, ex) + radius + 1))
  const z0 = Math.max(b.minZ, Math.floor(Math.min(sz, ez) - radius - 1))
  const z1 = Math.min(b.minZ + CHUNK_SIZE_Z - 1, Math.ceil(Math.max(sz, ez) + radius + 1))
  const y0 = Math.max(b.minY, Math.floor(Math.min(sy, ey) - radius - 1))
  const y1 = Math.min(b.maxY, Math.ceil(Math.max(sy, ey) + radius + 1))
  if (x0 > x1 || z0 > z1 || y0 > y1) return

  const tipStart = length * (1 - tipFraction)
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - sx
        const py = y + 0.5 - sy
        const pz = z + 0.5 - sz
        const along = px * dx + py * dy + pz * dz
        if (along < 0 || along > length) continue
        const perp2 = px * px + py * py + pz * pz - along * along
        const r = along <= tipStart ? radius : radius * (length - along) / (length - tipStart)
        if (perp2 > r * r) continue
        if (!canReplace(getAt(b, x, y, z))) continue
        const id = pick(x, y, z, along / length)
        if (id >= 0) setAt(b, x, y, z, id)
      }
    }
  }

  // Spine: a face-connected chain of cells along the axis, so thin tilted
  // tips never break into diagonal-only (floating) fragments.
  forEachSpineCell(sx, sy, sz, dx, dy, dz, length, (x, y, z, along) => {
    if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) return
    if (!canReplace(getAt(b, x, y, z))) return
    const id = pick(x, y, z, along)
    if (id >= 0) setAt(b, x, y, z, id)
  })
}

/**
 * Visit a 6-connected chain of cells following a line segment (start,
 * direction, length): where the line crosses into a diagonal neighbour, the
 * intermediate cells are visited too (x first, then y, then z). `along` is
 * the fraction of the length at the visited sample.
 */
export function forEachSpineCell(
  sx: number, sy: number, sz: number,
  dx: number, dy: number, dz: number,
  length: number,
  visit: (x: number, y: number, z: number, along: number) => void
): void {
  let px = Math.floor(sx)
  let py = Math.floor(sy)
  let pz = Math.floor(sz)
  visit(px, py, pz, 0)
  const steps = Math.max(1, Math.ceil(length / 0.25))
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * length * 0.98
    const cx = Math.floor(sx + dx * a)
    const cy = Math.floor(sy + dy * a)
    const cz = Math.floor(sz + dz * a)
    const f = a / length
    while (px !== cx || py !== cy || pz !== cz) {
      if (px !== cx) px += Math.sign(cx - px)
      else if (py !== cy) py += Math.sign(cy - py)
      else pz += Math.sign(cz - pz)
      visit(px, py, pz, f)
    }
  }
}
