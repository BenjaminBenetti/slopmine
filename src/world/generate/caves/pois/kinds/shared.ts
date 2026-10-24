import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import type { BlockSpec } from '../../../dungeons/DungeonTypes.ts'
import { PoiBuilder } from '../PoiBuilder.ts'

export const B = BlockIds
export const F = BlockFacing

/** Ancient masonry: mostly plain bricks, some mossy and cracked ones by position. */
export function masonry(b: PoiBuilder, mossy = 0.16, cracked = 0.14): BlockSpec {
  return (x, y, z) => {
    const h = b.hash(x, y, z, 31)
    return h < mossy ? B.MOSSY_ANCIENT_BRICKS : h < mossy + cracked ? B.CRACKED_ANCIENT_BRICKS : B.ANCIENT_BRICKS
  }
}

/** Pick by weight from a hash in [0, 1). */
export function weighted(h: number, table: ReadonlyArray<readonly [number, number]>): number {
  let total = 0
  for (const [, w] of table) total += w
  let r = h * total
  for (const [id, w] of table) {
    r -= w
    if (r < 0) return id
  }
  return table[table.length - 1][0]
}

/** A spec drawing from a weighted table by position. */
export function mix(b: PoiBuilder, salt: number, table: ReadonlyArray<readonly [number, number]>): BlockSpec {
  return (x, y, z) => weighted(b.hash(x, y, z, salt), table)
}

/** Horizontal distance from the local origin (or a given centre). */
export function dist(x: number, z: number, cx = 0, cz = 0): number {
  return Math.hypot(x - cx, z - cz)
}

/**
 * A walled room: a shell of `wall` around an air interior (inclusive local
 * bounds of the INTERIOR), a floor of `floor` under it with foundations
 * down to rock, and the wall's own foundation.
 */
export function walledRoom(
  b: PoiBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  wall: BlockSpec, floor: BlockSpec, ceiling: BlockSpec = wall
): void {
  b.fill(x0 - 1, y0, z0 - 1, x1 + 1, y1, z1 + 1, wall)
  b.fill(x0 - 1, y1 + 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1, ceiling)
  b.fill(x0, y0, z0, x1, y1, z1, B.AIR)
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const edge = x < x0 || x > x1 || z < z0 || z > z1
      b.set(x, y0 - 1, z, edge ? wall : floor)
      b.foundation(x, z, y0 - 2, B.STONE, 4)
    }
  }
}

/**
 * Scatter blocks over a rectangle at local height y: `pick` maps a hash to a
 * block id (or 0 for none), written where `test` accepts the cell - by
 * default open cells with solid ground under them (decorations on a floor);
 * pass `PoiBuilder.natural` to re-skin a floor or wall.
 */
export function scatter(
  b: PoiBuilder, x0: number, z0: number, x1: number, z1: number, y: number,
  salt: number, pick: (h: number, x: number, z: number) => number, test: (id: number) => boolean = PoiBuilder.open
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const id = pick(b.hash(x, y, z, salt), x, z)
      if (!id) continue
      if (test === PoiBuilder.open) {
        // Decorations need ground under them
        const below = b.get(x, y - 1, z)
        if (below < 0 || PoiBuilder.open(below)) continue
      }
      b.setIf(x, y, z, id, test)
    }
  }
}

/**
 * Hang decorations from the ceiling of a region: in each column, the first
 * open cell under solid (scanning down from `top`) may get one. Reads the
 * blocks already written (seam-safe: a cell is only ever decided by the
 * sub-chunk holding it).
 */
export function hangFromCeiling(
  b: PoiBuilder, x0: number, z0: number, x1: number, z1: number, bottom: number, top: number,
  salt: number, pick: (h: number) => number
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      for (let y = top; y > bottom; y--) {
        const above = b.get(x, y + 1, z)
        const here = b.get(x, y, z)
        if (above < 0 || here < 0) continue
        if (here === B.AIR && !PoiBuilder.open(above)) {
          const id = pick(b.hash(x, y, z, salt))
          if (id) b.set(x, y, z, id)
          break
        }
      }
    }
  }
}

/** Facing for a decoration that should face the local front (+Z), the default. */
export const FRONT = F.SOUTH
