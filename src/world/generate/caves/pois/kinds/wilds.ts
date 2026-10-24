import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, mix, scatter, weighted } from './shared.ts'

/** Natural wonders: hot springs, a fallen star, great roots, a frozen waterfall, a wyrm's burrow. */

/** A terrace basin: a horizontal ellipse of water at local height `y`, rimmed one cell all round. */
interface Basin {
  readonly cx: number
  readonly cz: number
  readonly rx: number
  readonly rz: number
  readonly y: number
}

const inBasin = (s: Basin, x: number, z: number): boolean => ((x - s.cx) / s.rx) ** 2 + ((z - s.cz) / s.rz) ** 2 <= 1

/** The basin's water or its rim covers this column (the rim: every cell touching the water, diagonals too). */
function onBasin(s: Basin, x: number, z: number): 'water' | 'rim' | null {
  if (inBasin(s, x, z)) return 'water'
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inBasin(s, x + dx, z + dz)) return 'rim'
  return null
}

/**
 * Travertine terraces in a white cavern: four stepped calcite basins of
 * water, each enclosed by its own rim at the water's level (nothing flows),
 * pearls and crystal buds on the rims, moss where the bottom pool spills.
 */
export const HOT_SPRINGS: PoiBuildDef = {
  kind: getPoiKind('hot_springs'),
  radius: 9, above: 8, below: 3,
  build(b) {
    b.ellipsoid(0, 3, -1, 9.4, 5.8, 8.4, mix(b, 401, [[B.CALCITE, 55], [B.DRIPSTONE_BLOCK, 30], [B.STONE, 15]]), 0.1, PoiBuilder.natural)
    b.chamber(0, 3, -1, 8.6, 5, 7.6, 0, B.CALCITE, 0.15)
    scatter(b, -8, -8, 8, 6, -1, 402, (h) => (h < 0.55 ? B.CALCITE : h < 0.72 ? B.DRIPSTONE_BLOCK : h < 0.8 ? B.DAMP_SLATE : 0), PoiBuilder.natural)

    // High at the back, stepping down to a pool sunk in the floor at the front
    const j = b.rng.next() * 2 - 1
    const basins: Basin[] = [
      { cx: j * 1.5, cz: -4.6, rx: 3.6, rz: 1.8, y: 2 },
      { cx: -j * 1.2 - 1, cz: -1.8, rx: 3.4, rz: 1.6, y: 1 },
      { cx: j + 1, cz: 0.8, rx: 3.2, rz: 1.6, y: 0 },
      { cx: -j * 0.8, cz: 3.4, rx: 3.0, rz: 1.5, y: -1 },
    ]
    const stone = (x: number, y: number, z: number): number => (b.hash(x, y, z, 403) < 0.18 ? B.DRIPSTONE_BLOCK : B.CALCITE)
    // Back to front: a lower basin only ever writes at or below its own level
    for (const s of basins) {
      for (let z = Math.floor(s.cz - s.rz) - 1; z <= Math.ceil(s.cz + s.rz) + 1; z++) {
        for (let x = Math.floor(s.cx - s.rx) - 1; x <= Math.ceil(s.cx + s.rx) + 1; x++) {
          const part = onBasin(s, x, z)
          if (!part) continue
          const top = part === 'water' ? s.y - 1 : s.y
          for (let y = top; y >= -1; y--) b.set(x, y, z, stone(x, y, z))
          if (s.y - 1 < -1) b.set(x, s.y - 1, z, B.CALCITE) // the sunken pool's bed
          b.foundation(x, z, Math.min(top, s.y - 1) - 1, B.STONE, 3)
          if (part === 'water') b.set(x, s.y, z, B.WATER)
        }
      }
    }
    // Pearls and crystal buds on rims no higher terrace covers
    basins.forEach((s, i) => {
      for (let z = Math.floor(s.cz - s.rz) - 1; z <= Math.ceil(s.cz + s.rz) + 1; z++) {
        for (let x = Math.floor(s.cx - s.rx) - 1; x <= Math.ceil(s.cx + s.rx) + 1; x++) {
          if (onBasin(s, x, z) !== 'rim') continue
          if (basins.slice(0, i).some((h) => onBasin(h, x, z))) continue
          const h = b.hash(x, s.y + 1, z, 404)
          if (h < 0.14) b.setIf(x, s.y + 1, z, B.CAVE_PEARLS, (id) => id === B.AIR)
          else if (h < 0.19) b.setIf(x, s.y + 1, z, B.CELESTITE_BUD, (id) => id === B.AIR)
        }
      }
    })
    // Moss and glow blooms where the bottom pool spills over the floor
    const pool = basins[3]
    for (let z = -3; z <= 7; z++) {
      for (let x = -7; x <= 7; x++) {
        if (basins.some((s) => onBasin(s, x, z))) continue
        const spill = Math.hypot((x - pool.cx) / (pool.rx + 2.6), (z - pool.cz) / (pool.rz + 2.6))
        if (spill > 1) continue
        const h = b.hash(x, -1, z, 405)
        if (h < 0.75) b.setIf(x, -1, z, h < 0.55 ? B.MOSS : B.DAMP_SLATE, PoiBuilder.natural)
        if (h < 0.55 && b.hash(x, 0, z, 406) < 0.18) b.setIf(x, 0, z, B.GLOW_BLOOM, (id) => id === B.AIR)
      }
    }
    hangFromCeiling(b, -8, -8, 8, 6, 3, 8, 407, (h) => (h < 0.09 ? B.STALACTITE : 0))
    scatter(b, -7, -7, 7, 5, 0, 408, (h, x, z) => (basins.some((s) => onBasin(s, x, z)) ? 0 : h < 0.035 ? B.STALAGMITE : h < 0.05 ? B.CELESTITE_CLUSTER : 0))

    // The chest on the highest terrace's rim, at its left end
    const top = basins[0]
    const cz = Math.round(top.cz)
    let cx = Math.floor(top.cx - top.rx) - 1
    while (cx < 0 && !inBasin(top, cx + 1, cz)) cx++
    b.chest(cx, top.y + 1, cz, FRONT)
    b.keystone(0, -3, 0)
  },
}

/**
 * A crater scorched into the floor, rays of burnt rock around it, and the
 * meteorite half-buried at its heart - obsidian shot through with veins of
 * magma and celestite - its fragments scattered about.
 */
export const FALLEN_STAR: PoiBuildDef = {
  kind: getPoiKind('fallen_star'),
  radius: 9, above: 7, below: 4,
  build(b) {
    const R = 6.2
    const depth = (x: number, z: number): number => {
      const d = dist(x, z)
      return d < R ? Math.round(2.6 * (1 - (d / R) ** 2)) : 0
    }
    const floorY = (x: number, z: number): number => -1 - depth(x, z)
    b.ellipsoid(0, 3, 0, 9.4, 5.4, 9.4, mix(b, 411, [[B.BASALT, 45], [B.STONE, 35], [B.SMOLDERING_STONE, 10], [B.OBSIDIAN, 10]]), 0.12, PoiBuilder.natural)
    b.chamber(0, 3, 0, 8.6, 4.6, 8.6, 0, B.BASALT, 0.16)

    // The crater bowl, and rays of scorched rock across the floor beyond it
    const turn = b.rng.next() * Math.PI * 2
    for (let z = -8; z <= 8; z++) {
      for (let x = -8; x <= 8; x++) {
        const d = dist(x, z)
        if (d > 8.6) continue
        if (d < R) {
          const fy = floorY(x, z)
          b.fill(x, fy + 1, z, x, -1, z, B.AIR)
          const h = b.hash(x, fy, z, 412)
          b.set(x, fy, z, d < 2.4
            ? weighted(h, [[B.OBSIDIAN, 50], [B.MAGMA, 20], [B.BASALT, 30]])
            : d < 4.2 ? weighted(h, [[B.OBSIDIAN, 30], [B.BASALT, 50], [B.SMOLDERING_STONE, 20]])
              : weighted(h, [[B.BASALT, 50], [B.SMOLDERING_STONE, 25], [B.STONE, 25]]))
          b.foundation(x, z, fy - 1, B.BASALT, 3)
        } else {
          const ray = Math.sin(Math.atan2(z, x) * 7 + turn) * 0.5 + 0.5 + (b.hash(x, -1, z, 413) - 0.5) * 0.4
          if (ray > 0.55) b.setIf(x, -1, z, ray > 0.82 ? B.SMOLDERING_STONE : B.BASALT, PoiBuilder.natural)
          // The crater's thrown-up lip
          if (d < R + 1.3 && b.hash(x, 0, z, 414) < 0.5) b.setIf(x, 0, z, b.hash(x, 0, z, 415) < 0.6 ? B.BASALT : B.STONE, (id) => id === B.AIR)
        }
      }
    }

    // The meteorite: obsidian and basalt, veined with magma and celestite
    b.ellipsoid(0, -1, 0, 2.7, 2.7, 2.7, (x, y, z) => {
      if (Math.abs(b.smoothNoise(x * 2, y * 2, z * 2, 416) - 0.5) < 0.06) return b.hash(x, y, z, 417) < 0.45 ? B.MAGMA : B.CELESTITE_BLOCK
      return b.hash(x, y, z, 418) < 0.65 ? B.OBSIDIAN : B.BASALT
    }, 0.2)
    // Broken-off fragments
    for (let i = 0; i < 6; i++) {
      const a = turn + i * 1.05 + b.rng.next() * 0.6
      const r = 3.4 + b.rng.next() * 2.2
      const fx = Math.round(Math.cos(a) * r)
      const fz = Math.round(Math.sin(a) * r)
      const id = b.rng.chance(0.3) ? B.CELESTITE_BLOCK : B.OBSIDIAN
      b.set(fx, floorY(fx, fz) + 1, fz, id)
      if (b.rng.chance(0.4)) b.set(fx, floorY(fx, fz) + 2, fz, B.OBSIDIAN)
    }

    // The chest, half-buried by the blast
    const ca = turn + 0.5
    const chx = Math.round(Math.cos(ca) * 3.6)
    const chz = Math.round(Math.sin(ca) * 3.6)
    const chy = floorY(chx, chz) + 1
    const sx = chx >= 0 ? 1 : -1
    const sz = chz >= 0 ? 1 : -1
    b.set(chx + sx, chy, chz, B.BASALT)
    b.set(chx, chy, chz + sz, B.BASALT)
    b.set(chx + sx, chy, chz + sz, B.BASALT)
    b.set(chx + sx, chy + 1, chz + sz, B.SMOLDERING_STONE)
    b.chest(chx, chy, chz, FRONT)

    // Ejecta over the floor and in the bowl
    for (let z = -7; z <= 7; z++) {
      for (let x = -7; x <= 7; x++) {
        const d = dist(x, z)
        if (d > 7.6) continue
        const y = d < R ? floorY(x, z) + 1 : 0
        const h = b.hash(x, y, z, 419)
        const id = h < 0.07 ? B.CINDERS : h < 0.12 ? B.EMBERS : h < 0.16 ? B.OBSIDIAN_SHARDS : h < 0.18 ? B.VOLCANIC_ROCKS : 0
        if (id) b.setIf(x, y, z, id, (cur) => cur === B.AIR)
      }
    }
    b.keystone(-3, -4, -3)
  },
}

/**
 * The roots of an enormous tree breaking through the ceiling of a mossy
 * cavern: a great taproot from the rock above down into the floor, buttress
 * roots crawling out over the moss - dipping under mossy humps where they
 * turn, thinning toward their tips - lesser roots coming down around it, a
 * plate of roots spread through the ceiling rock and root strands dangling
 * from it. No log shows its cut end: vertical roots are buried at both ends,
 * horizontal ones are fallen logs (bark all round) whose ends butt against
 * another log, a mossy hump or rock.
 */
export const GREAT_ROOTS: PoiBuildDef = {
  kind: getPoiKind('great_roots'),
  radius: 10, above: 13, below: 3,
  build(b) {
    const CX = 0, CY = 4, CZ = -1, RX = 9.2, RY = 6, RZ = 8.4, ROUGH = 0.15
    b.chamber(CX, CY, CZ, RX, RY, RZ, 0, B.DIRT, ROUGH)
    scatter(b, -9, -9, 9, 7, -1, 421, (h) => (h < 0.5 ? B.MOSS : h < 0.66 ? B.PODZOL : h < 0.78 ? B.DIRT : h < 0.84 ? B.MOSSY_STONE : 0), PoiBuilder.natural)
    const ceiling = (x: number, z: number): number => b.ellipsoidTop(CX, CY, CZ, RX, RY, RZ, ROUGH, x, z)
    const log = B.PINE_LOG
    /** A horizontal log along local x or z: bark on every face but its two ends. */
    const along = (localX: boolean): number => (localX === (b.site.rotation % 2 === 0) ? B.FALLEN_PINE_LOG_X : B.FALLEN_PINE_LOG_Z)
    const hump = (x: number, z: number): number => (b.hash(x, 0, z, 422) < 0.75 ? B.MOSS : B.PODZOL)

    /**
     * A vertical root from inside the floor up into the ceiling rock, its top
     * end under rock: one cell into the ceiling where the rock is thick, up to
     * the ceiling where it is thin (never poking into a cave above), capped
     * with stone where the chamber opened straight into another cave.
     */
    const column = (x: number, z: number): void => {
      const c0 = Math.min(12, ceiling(x, z))
      const top = !b.isCave(x, c0, z) && !b.isCave(x, c0 + 1, z) ? c0 : c0 - 1
      b.fill(x, -2, z, x, top, z, log)
      b.foundation(x, z, -3, B.STONE, 1) // its foot stays buried over a cave below
      if (b.isCave(x, c0, z)) b.set(x, c0, z, B.STONE)
    }
    /**
     * A root crawling over the floor from (x, z): straight segments, one per
     * direction, each ending under a mossy hump; the next segment starts on
     * the hump's far side, so every log end butts against a log or a hump.
     */
    const crawl = (x: number, z: number, legs: ReadonlyArray<readonly [number, number, number]>): void => {
      legs.forEach(([dx, dz, len], i) => {
        const id = along(dx !== 0)
        for (let k = 0; k < len; k++) {
          b.set(x, 0, z, id)
          x += dx
          z += dz
        }
        b.set(x, 0, z, hump(x, z))
        const next = legs[i + 1]
        if (next) {
          x += next[0]
          z += next[1]
        }
      })
    }

    // The taproot: 2×2, from the rock above into the floor
    const tx = b.rng.int(-2, 1)
    const tz = b.rng.int(-3, -1)
    for (const [x, z] of [[tx, tz], [tx + 1, tz], [tx, tz + 1], [tx + 1, tz + 1]]) column(x, z)
    // Buttresses from each face: two logs wide at the trunk, then one root turning away and thinning
    const L = (): number => 2 + b.rng.int(0, 1)
    const turn = (): number => 1 + b.rng.int(0, 1)
    const len1 = [L(), L(), L(), L()]
    // +x face (rows tz, tz+1): the tz row turns away to -z
    crawl(tx + 2, tz, [[1, 0, len1[0]], [0, -1, turn()], [1, 0, 1 + b.rng.int(0, 1)]])
    crawl(tx + 2, tz + 1, [[1, 0, len1[0] - 1]])
    // -x face: the tz row turns away to -z (the chest sits beside the tz+1 row)
    crawl(tx - 1, tz, [[-1, 0, len1[1]], [0, -1, turn()], [-1, 0, 1]])
    crawl(tx - 1, tz + 1, [[-1, 0, len1[1] - 1]])
    // +z face (columns tx, tx+1): the tx+1 column turns away to +x
    crawl(tx + 1, tz + 2, [[0, 1, len1[2]], [1, 0, turn()], [0, 1, 1 + b.rng.int(0, 1)]])
    crawl(tx, tz + 2, [[0, 1, len1[2] - 1]])
    // -z face: the tx column turns to -x
    crawl(tx, tz - 1, [[0, -1, len1[3]], [-1, 0, turn()], [0, -1, 1]])
    crawl(tx + 1, tz - 1, [[0, -1, len1[3] - 1]])

    // Lesser roots coming down around it, each with a short runner at its foot
    const spin = b.rng.next() * Math.PI * 2
    for (let k = 0; k < 4; k++) {
      const a = spin + k * 1.57 + b.rng.next() * 0.6
      const r = 5 + b.rng.next() * 1.6
      const x = Math.round(Math.cos(a) * r)
      const z = Math.round(Math.sin(a) * r) - 1
      if (ceiling(x, z) <= 3) continue
      column(x, z)
      const dx = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? Math.sign(Math.cos(a)) : 0
      const dz = dx === 0 ? Math.sign(Math.sin(a)) : 0
      crawl(x + dx, z + dz, [[dx, dz, 1 + b.rng.int(0, 1)], [dz, -dx, 1]])
    }

    // The root plate: runners through the ceiling rock from the taproot, only their bark showing from below
    const yc = Math.min(ceiling(tx, tz), ceiling(tx + 1, tz), ceiling(tx, tz + 1), ceiling(tx + 1, tz + 1))
    const inRock = (x: number, z: number): boolean => ceiling(x, z) <= yc && !b.isCave(x, yc, z)
    const plate: Array<[number, number]> = []
    for (const [dx, dz, sx, sz] of [[1, 0, tx + 2, tz], [-1, 0, tx - 1, tz + 1], [0, 1, tx + 1, tz + 2], [0, -1, tx, tz - 1], [1, 0, tx + 2, tz + 1], [0, 1, tx, tz + 2]] as const) {
      // Stop one short of the first cell that isn't rock: the last log's end stays buried
      let n = 0
      while (n < 7 && inRock(sx + dx * (n + 1), sz + dz * (n + 1)) && inRock(sx + dx * n, sz + dz * n)) n++
      for (let k = 0; k < n; k++) {
        b.set(sx + dx * k, yc, sz + dz * k, along(dx !== 0))
        plate.push([sx + dx * k, sz + dz * k])
      }
    }
    // Root strands dangling from the plate's exposed undersides, and from the ceiling all round
    for (const [x, z] of plate) {
      if (ceiling(x, z) !== yc || b.hash(x, yc, z, 428) > 0.55) continue
      const n = 1 + Math.floor(b.hash(x, yc - 1, z, 429) * 3)
      for (let k = 1; k <= n; k++) b.setIf(x, yc - k, z, B.HANGING_ROOTS, (id) => id === B.AIR)
    }
    for (let z = -8; z <= 6; z++) {
      for (let x = -8; x <= 8; x++) {
        if (b.hash(x, 0, z, 430) > 0.12) continue
        const top = ceiling(x, z)
        if (top <= 3 || top > 12) continue
        const n = 1 + Math.floor(b.hash(x, 1, z, 431) * 4)
        for (let k = 1; k <= n; k++) b.setIf(x, top - k, z, B.HANGING_ROOTS, (id) => id === B.AIR)
      }
    }
    hangFromCeiling(b, -8, -9, 8, 6, 2, 12, 424, (h) => (h < 0.1 ? B.HANGING_ROOTS : h < 0.18 ? B.CAVE_VINES_BERRIES : h < 0.22 ? B.CAVE_VINES : 0))
    b.chest(tx - 1, 0, tz + 2, FRONT)
    scatter(b, -8, -8, 8, 6, 0, 425, (h) => (h < 0.07 ? B.GLOW_BLOOM : h < 0.15 ? B.CAVE_FERN : h < 0.18 ? B.BROWN_MUSHROOMS : h < 0.2 ? B.LUMEN_FERN : 0))
    // Ferns and blooms on the mossy humps and the roots themselves
    scatter(b, -8, -8, 8, 6, 1, 426, (h) => (h < 0.06 ? B.CAVE_FERN : h < 0.09 ? B.GLOW_BLOOM : 0))
    b.keystone(tx, -2, tz)
  },
}

/**
 * A tall, frost-rimed chamber where a waterfall froze as it fell: a curtain
 * of ice spilling from a crack high in the back wall to a splash mound and
 * a frozen pool, crystals frozen into its face, icicles everywhere.
 */
export const FROZEN_WATERFALL: PoiBuildDef = {
  kind: getPoiKind('frozen_waterfall'),
  radius: 8, above: 13, below: 3,
  build(b) {
    const CX = 0, CY = 5, CZ = -1, RX = 7.2, RY = 7.4, RZ = 6.2, ROUGH = 0.12
    b.ellipsoid(CX, CY, CZ, RX + 1.2, RY + 1, RZ + 1.2, mix(b, 431, [[B.FROSTED_STONE, 70], [B.GLACIAL_ICE, 20], [B.STONE, 10]]), 0.1, PoiBuilder.natural)
    b.chamber(CX, CY, CZ, RX, RY, RZ, 0, B.FROSTED_STONE, ROUGH)
    scatter(b, -7, -7, 7, 5, -1, 432, (h) => (h < 0.3 ? B.GLACIAL_ICE : 0), PoiBuilder.natural)

    // The frozen pool at the front
    const pool = (x: number, z: number): number => (x / 3.6) ** 2 + ((z - 0.8) / 2.4) ** 2
    for (let z = -2; z <= 4; z++) {
      for (let x = -4; x <= 4; x++) {
        if (pool(x, z) > 1) continue
        b.set(x, -1, z, B.POLISHED_ICE)
        b.set(x, -2, z, B.BLACK_ICE)
      }
    }

    // The curtain: hugging the back wall from the crack down, widening as it falls
    const TOP = 11
    const sway = b.rng.next() * 2 - 1
    const backWall = (y: number): number => CZ - RZ * Math.sqrt(Math.max(0, 1 - ((y - CY) / RY) ** 2))
    const iceAt = (x: number, y: number, z: number): number => {
      const streak = b.hash(x, 0, 0, 433)
      if (streak < 0.22) return B.POLISHED_ICE
      if (streak < 0.32) return B.BLACK_ICE
      return b.hash(x, y, z, 434) < 0.12 ? B.POLISHED_ICE : B.GLACIAL_ICE
    }
    for (let y = 0; y <= TOP; y++) {
      const half = 0.8 + (TOP - y) * 0.22
      const mid = sway * (TOP - y) * 0.08
      const zb = Math.round(backWall(y))
      for (let x = Math.floor(mid - half - 1); x <= Math.ceil(mid + half + 1); x++) {
        const edge = half + (b.smoothNoise(x, y, 0, 435) - 0.5) * 1.2
        if (Math.abs(x - mid) > edge) continue
        // Fluted: each column of falling water froze at its own depth; thicker toward the foot,
        // which fans out into a splash mound
        const flute = Math.floor(b.hash(x, 0, 7, 436) * 2.6)
        // (the splash mound stops at the frozen pool's back edge)
        const thick = 1 + flute + (y <= 3 ? Math.floor((3 - y) * 0.7) : 0) + (y <= 1 ? 2 - y : 0)
        const front = y <= 2 ? Math.min(zb + thick, -2 - y) : zb + thick
        for (let z = zb - 2; z <= front; z++) b.set(x, y, z, iceAt(x, y, z))
        // Crystals frozen into its face
        if (y >= 2 && b.hash(x, y, front, 437) < 0.06) b.set(x, y, front, B.CELESTITE_BLOCK)
      }
    }
    // The lip it pours over, and the crack above
    const lipZ = Math.round(backWall(TOP + 1))
    for (let x = -2; x <= 2; x++) {
      for (let z = lipZ - 1; z <= lipZ + 2 - (Math.abs(x) === 2 ? 1 : 0); z++) b.set(x, TOP + 1, z, B.FROSTED_STONE)
    }
    const crackZ = Math.round(backWall(TOP + 2))
    for (let x = -1; x <= 1; x++) b.set(x, TOP + 2, crackZ, x === 0 ? B.AIR : B.BLACK_ICE)

    // The chest, frozen in at the side of the splash mound
    const cx = sway > 0 ? -4 : 4
    const out = Math.sign(cx)
    b.set(cx + out, 0, -2, B.GLACIAL_ICE)
    b.set(cx, 0, -3, B.GLACIAL_ICE)
    b.set(cx + out, 1, -2, B.GLACIAL_ICE)
    b.set(cx, 1, -3, B.POLISHED_ICE)
    b.set(cx + out, 0, -3, B.GLACIAL_ICE)
    b.chest(cx, 0, -2, FRONT)
    b.set(cx - out, 0, -2, B.AIR)

    scatter(b, -6, -6, 6, 5, 0, 438, (h, x, z) => (pool(x, z) <= 1.15 ? 0 : h < 0.38 ? B.SNOW_PATCH : h < 0.42 ? B.CELESTITE_CLUSTER : 0))
    hangFromCeiling(b, -6, -7, 6, 4, 2, 13, 439, (h) => (h < 0.3 ? B.ICICLE : 0))
    b.keystone(0, -2, -2)
  },
}

/**
 * A perfectly round tunnel bored across the rock, ribbed like a gullet and
 * banded in coloured stone, the skeleton of the wyrm that made it lying along
 * its floor, its head at the dead end; one end has collapsed, and a pocket
 * off the side holds what the wyrm swallowed.
 */
export const WYRM_BURROW: PoiBuildDef = {
  kind: getPoiKind('wyrm_burrow'),
  radius: 12, above: 7, below: 3,
  build(b) {
    const R = 3.2
    const CY = 2.2
    const phase = b.rng.next() * Math.PI * 2
    const centre = (x: number): number => -1.5 + 1.4 * Math.sin(x * 0.16 + phase)
    // Rounded dead end at +x (where the wyrm died); -x ends in a collapse
    const radiusAt = (x: number): number => (x > 8 ? R * Math.sqrt(Math.max(0, 1 - ((x - 8) / 3.6) ** 2)) : R)
    const BANDS = [B.GRANITE, B.ANDESITE, B.DRIPSTONE_BLOCK]
    const debris = mix(b, 441, [[B.GRAVEL, 55], [B.STONE, 30], [B.ANDESITE, 15]])

    for (let x = -12; x <= 12; x++) {
      const r = radiusAt(x)
      if (r <= 0.5) continue
      const c = centre(x)
      const band = BANDS[Math.floor((x + 120) / 3) % 3]
      const rib = ((x % 3) + 3) % 3 === 0 && r >= R - 0.01
      for (let y = -1; y <= 7; y++) {
        for (let z = Math.floor(c - r - 1.5); z <= Math.ceil(c + r + 1.5); z++) {
          const d = Math.hypot(y - CY, z - c)
          if (d < r) {
            if (y < 0) {
              b.set(x, y, z, debris)
              b.foundation(x, z, y - 1, B.STONE, 2)
            } else if (rib && d >= r - 0.9 && y >= 1 && b.isRock(x, y, z)) {
              b.set(x, y, z, B.DRIPSTONE_BLOCK)
            } else {
              b.set(x, y, z, B.AIR)
            }
          } else if (d < r + 1.2 && b.isRock(x, y, z)) {
            b.set(x, y, z, band)
          }
        }
      }
    }
    // The collapse
    for (let x = -12; x <= -8; x++) {
      const c = centre(x)
      const fill = Math.floor(-1 + (-7 - x) * 1.4)
      for (let y = 0; y <= fill; y++) {
        for (let z = Math.floor(c - R); z <= Math.ceil(c + R); z++) {
          if (Math.hypot(y - CY, z - c) < R) b.set(x, y, z, debris)
        }
      }
    }
    // Broken through to the cave in front
    const bx = b.rng.int(-2, 1)
    for (let x = bx - 2; x <= bx + 3; x++) {
      const c = centre(x)
      const reach = Math.ceil(c + R) + 3
      for (let z = Math.floor(c + R - 1); z <= reach; z++) {
        const lip = x === bx - 2 || x === bx + 3 ? 2 : 3
        b.fill(x, 0, z, x, lip, z, B.AIR)
        b.set(x, -1, z, debris)
        b.foundation(x, z, -2, B.STONE, 2)
      }
    }

    // The wyrm: spine, ribcage, a great skull at the dead end, the tail lost in the collapse
    const bone = B.FOSSIL_BONE
    const spine = (x: number): number => Math.round(centre(x) + 0.6 * Math.sin(x * 0.5 + phase * 2))
    for (let x = -7; x <= 6; x++) b.set(x, 0, spine(x), bone)
    for (let x = -5; x <= 5; x += 2) {
      const s = spine(x)
      for (const side of [-1, 1]) {
        if (b.hash(x, 1, s + side, 442) < 0.15) continue
        b.set(x, 0, s + side, bone)
        b.set(x, 1, s + side * 2, bone)
        if (b.hash(x, 2, s + side, 443) < 0.75) b.set(x, 2, s + side * 2, bone)
      }
    }
    const hs = spine(7)
    b.fill(7, 0, hs - 1, 9, 1, hs + 1, bone)
    b.set(8, 1, hs - 1, B.AIR) // eye sockets
    b.set(8, 1, hs + 1, B.AIR)
    b.fill(10, 0, hs - 1, 10, 0, hs + 1, bone) // the jaw
    b.set(10, 1, hs - 1, bone) // fangs
    b.set(10, 1, hs + 1, bone)
    b.set(7, 2, hs, bone) // a horn

    // The pocket where it kept what it swallowed
    const nx = -3
    const nz = Math.round(centre(nx) - R - 1.4)
    b.ellipsoid(nx, 1, nz, 2.4, 1.6, 1.8, (_x, y) => (y < 0 ? B.GRAVEL : B.AIR))
    b.fill(nx - 1, 0, nz + 1, nx + 1, 2, nz + 2, B.AIR)
    b.set(nx - 2, 0, nz, B.SKULL, b.facing(F.EAST))
    b.set(nx + 1, 0, nz, B.BEDROLL, b.facing(F.WEST))
    b.set(nx - 1, 0, nz - 1, B.BONE_PILE)
    b.set(nx + 2, 0, nz + 1, B.MINERS_LANTERN)
    b.set(nx - 1, 0, nz + 1, B.GOLD_COINS)
    b.chest(nx, 0, nz - 1, FRONT)
    scatter(b, -11, -6, 11, 4, 0, 444, (h) => (h < 0.04 ? B.CAVE_BONES : h < 0.08 ? B.PEBBLES : 0))
    b.keystone(nx, -2, nz + 1)
  },
}

export const WILD_KINDS: readonly PoiBuildDef[] = [HOT_SPRINGS, FALLEN_STAR, GREAT_ROOTS, FROZEN_WATERFALL, WYRM_BURROW]
