import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, hangFromCeiling, scatter, weighted } from './shared.ts'

/** Strange things: a ship under the ground, a spider queen's nest. */

/** A longship lying in the bed of a long-dry underground river. */
export const BURIED_LONGSHIP: PoiBuildDef = {
  kind: getPoiKind('buried_longship'),
  radius: 13, above: 9, below: 3,
  build(b) {
    b.chamber(0, 3, 0, 12.6, 5.6, 6.4, 0, B.SAND, 0.15)
    scatter(b, -12, -6, 12, 6, -1, 231, (h) => weighted(h, [[B.SAND, 5], [B.GRAVEL, 3], [B.CLAY, 2]]), PoiBuilder.natural)
    const plank = B.PINE_PLANKS
    const half = (x: number): number => 2.6 * Math.pow(Math.max(0, 1 - (x / 10.5) ** 2), 0.6)
    for (let x = -10; x <= 10; x++) {
      const w = half(x)
      const edge = Math.max(1, Math.round(w))
      b.set(x, -1, 0, B.OAK_LOG) // keel
      for (let z = -edge; z <= edge; z++) {
        const side = Math.abs(z) === edge
        if (!side) {
          b.set(x, 0, z, plank)
          continue
        }
        // Hull sides, rotted through here and there
        for (let y = 0; y <= 2; y++) if (b.hash(x, y, z, 232) > 0.1) b.set(x, y, z, plank)
      }
    }
    // Curling stem and stern posts, a beast's head on the prow
    for (const s of [-1, 1]) {
      b.fill(s * 11, 0, 0, s * 11, 3, 0, B.OAK_LOG)
      b.set(s * 12, 4, 0, B.OAK_LOG)
      b.set(s * 12, 5, 0, B.OAK_LOG)
    }
    b.set(12, 6, 0, B.SKULL, b.facing(F.EAST))
    // The broken mast and its yard
    b.fill(0, 1, 0, 0, 6, 0, B.OAK_LOG)
    b.fill(0, 6, -3, 0, 6, 3, B.OAK_FENCE)
    b.set(0, 6, 0, B.OAK_LOG)
    // Oars resting on the riverbed
    for (let x = -6; x <= 6; x += 3) {
      for (const s of [-1, 1]) {
        const e = Math.max(1, Math.round(half(x)))
        b.set(x, 1, s * (e + 1), B.OAK_FENCE)
        b.set(x, 0, s * (e + 2), B.OAK_FENCE)
      }
    }
    // Cargo
    b.chest(-3, 1, 0, FRONT)
    b.chest(4, 1, 0, FRONT)
    b.set(-5, 1, -1, B.BARREL)
    b.set(2, 1, 1, B.BARREL)
    scatter(b, -8, -2, 8, 2, 1, 233, (h) => (h < 0.15 ? B.GOLD_COINS : 0))
    scatter(b, -12, -6, 12, 6, 0, 234, (h) => (h < 0.05 ? B.BEACH_SHELLS : h < 0.08 ? B.DRIFTWOOD : h < 0.1 ? B.PEBBLES : 0))
    b.keystone(0, -2, 0)
  },
}

/** A great web-choked chamber: egg sacs, cocoons, bones, and a chest wrapped in silk. */
export const SPIDER_NEST: PoiBuildDef = {
  kind: getPoiKind('spider_nest'),
  radius: 9, above: 9, below: 3,
  build(b) {
    b.chamber(0, 3, 0, 8.4, 5, 8.4, 0, B.STONE, 0.2)
    scatter(b, -8, -8, 8, 8, -1, 251, (h) => (h < 0.15 ? B.GRAVEL : 0), PoiBuilder.natural)
    // Webs where the walls and ceiling close in
    for (let y = 0; y <= 8; y++) {
      for (let z = -8; z <= 8; z++) {
        for (let x = -8; x <= 8; x++) {
          if (b.get(x, y, z) !== B.AIR) continue
          let walls = 0
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const id = b.get(x + dx, y + dy, z + dz)
            if (id >= 0 && !PoiBuilder.open(id)) walls++
          }
          const chance = walls >= 3 ? 0.55 : walls === 2 ? 0.3 : walls === 1 && y >= 4 ? 0.12 : y >= 5 ? 0.04 : 0
          if (b.hash(x, y, z, 252) < chance) b.set(x, y, z, B.COBWEB)
        }
      }
    }
    scatter(b, -7, -7, 7, 7, 0, 253, (h) => (h < 0.08 ? B.EGG_SAC : h < 0.11 ? B.CAVE_BONES : h < 0.13 ? B.SKULL : h < 0.15 ? B.BONE_PILE : 0))
    hangFromCeiling(b, -7, -7, 7, 7, 2, 9, 254, (h) => (h < 0.08 ? B.SILK_COCOON : 0))
    // The silk-wrapped chest
    b.chest(0, 0, -5, FRONT)
    for (const [x, y, z] of [[-1, 0, -5], [1, 0, -5], [0, 1, -5], [-1, 1, -5], [1, 1, -5]]) b.set(x, y, z, B.COBWEB)
    b.keystone(0, -2, -3)
  },
}

export const WONDER_KINDS: readonly PoiBuildDef[] = [BURIED_LONGSHIP, SPIDER_NEST]
