import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, mix, scatter } from './shared.ts'

/** Natural wonders: a giant geode, a fossil, a stone tree, a fairy ring, a garden, a sunken shrine. */

/**
 * A hollow stone egg lined with glowing celestite. Its shell only forms in
 * the rock, so where the cave cut through it you see the layers in section.
 */
export const GIANT_GEODE: PoiBuildDef = {
  kind: getPoiKind('giant_geode'),
  radius: 8, above: 10, below: 7,
  build(b) {
    const cx = 0, cy = 2, cz = -1
    const R = 7.4
    for (let y = -6; y <= 10; y++) {
      for (let z = -8; z <= 7; z++) {
        for (let x = -8; x <= 8; x++) {
          const r = Math.hypot(x - cx, y - cy, z - cz)
          if (r > R) continue
          if (r <= 4.3) b.set(x, y, z, B.AIR)
          else if (b.isRock(x, y, z)) b.set(x, y, z, r > 6.3 ? B.BASALT : r > 5.3 ? B.CALCITE : B.CELESTITE_BLOCK)
        }
      }
    }
    // Crystals grow from the lining into the hollow
    for (let y = -2; y <= 6; y++) {
      for (let z = -5; z <= 3; z++) {
        for (let x = -4; x <= 4; x++) {
          if (Math.hypot(x - cx, y - cy, z - cz) > 4.3) continue
          const lined = (dy: number): boolean => Math.hypot(x - cx, y + dy - cy, z - cz) > 4.3 && b.isRock(x, y + dy, z)
          const h = b.hash(x, y, z, 121)
          if (lined(-1)) {
            if (h < 0.32) b.set(x, y, z, h < 0.14 ? B.CELESTITE_CLUSTER : B.CELESTITE_BUD)
          } else if (lined(1)) {
            if (h < 0.3) b.set(x, y, z, B.HANGING_CELESTITE)
          }
        }
      }
    }
    b.keystone(0, -6, -1)
  },
}

/** The bones of a giant beast in the floor of a long cave, and the camp of the people digging it out. */
export const GIANT_FOSSIL: PoiBuildDef = {
  kind: getPoiKind('giant_fossil'),
  radius: 10, above: 8, below: 3,
  build(b) {
    b.chamber(0, 3, -1, 9.6, 4.8, 6.4, 0, B.STONE, 0.15)
    scatter(b, -9, -7, 9, 5, -1, 131, (h) => (h < 0.22 ? B.GRAVEL : h < 0.3 ? B.SAND : 0), PoiBuilder.natural)
    const bone = B.FOSSIL_BONE
    const sz = -2
    // A great beast's skeleton, still standing, sunk to the ankles in the floor
    for (const lx of [-3, 3]) {
      for (const s of [-1, 1]) {
        b.fill(lx, -1, sz + s, lx, 1, sz + s, bone)
        b.set(lx + (lx < 0 ? -1 : 1), 0, sz + s * 2, bone) // splayed foot
      }
    }
    // Spine arched over the legs
    for (let x = -4; x <= 4; x++) b.set(x, Math.abs(x) >= 4 ? 2 : 3, sz, bone)
    // Ribs hanging from it, a few missing
    for (const x of [-2, 0, 2]) {
      for (const s of [-1, 1]) {
        if (b.hash(x, 2, sz + s, 132) < 0.12) continue
        b.set(x, 2, sz + s, bone)
        b.set(x, 1, sz + s * 2, bone)
        if (b.hash(x, 0, sz + s, 133) > 0.3) b.set(x, 0, sz + s * 2, bone)
      }
    }
    // Neck and skull, the jaw hanging open
    b.set(5, 3, sz, bone)
    b.set(6, 4, sz, bone)
    b.set(7, 4, sz, bone)
    b.fill(8, 3, sz - 1, 10, 4, sz + 1, bone)
    b.set(8, 4, sz - 1, B.AIR)
    b.set(8, 4, sz + 1, B.AIR)
    b.fill(9, 3, sz, 10, 3, sz, B.AIR)
    b.fill(8, 1, sz, 10, 1, sz, bone)
    b.set(7, 5, sz - 1, bone)
    b.set(7, 5, sz + 1, bone)
    // The tail sweeping down to the floor
    for (const [x, y, dz] of [[-5, 2, 0], [-6, 2, 1], [-7, 1, 1], [-8, 1, 0], [-9, 0, -1]]) b.set(x, y, sz + dz, bone)
    // Bones the diggers already lifted out
    for (const [x, z] of [[-6, 2], [5, 2], [1, 3]]) b.set(x, 0, z, B.FOSSIL_BONE)
    // The excavation
    b.fill(-5, 0, 1, -5, 1, 1, B.OAK_FENCE)
    b.set(-5, 2, 1, B.MINERS_LANTERN)
    b.fill(5, 0, 1, 5, 1, 1, B.OAK_FENCE)
    b.set(5, 2, 1, B.MINERS_LANTERN)
    b.set(6, 0, 2, B.ORE_CRATE)
    b.set(-6, 0, 2, B.BEDROLL, b.facing(F.EAST))
    b.chest(-4, 0, 3, FRONT)
    b.set(4, 0, 3, B.BARREL)
    scatter(b, -8, -6, 8, 3, 0, 134, (h) => (h < 0.05 ? B.CAVE_BONES : h < 0.1 ? B.PEBBLES : 0))
    b.keystone(0, -2, -1)
  },
}

/** A tree turned to stone in a tall cavern, crystal blossoms in its canopy. */
export const PETRIFIED_TREE: PoiBuildDef = {
  kind: getPoiKind('petrified_tree'),
  radius: 10, above: 14, below: 3,
  build(b) {
    b.chamber(0, 6, 0, 9.4, 8, 9.4, 0, B.STONE, 0.14)
    scatter(b, -8, -8, 8, 8, -1, 141, (h, x, z) => {
      const d = dist(x, z)
      return d < 4.5 ? (h < 0.6 ? B.MOSS : B.MOSSY_STONE) : d < 7 && h < 0.35 ? B.MOSSY_STONE : 0
    }, PoiBuilder.natural)
    const wood = B.PETRIFIED_WOOD
    // Trunk (2×2) with a flared base
    b.fill(-1, 0, -1, 0, 8, 0, wood)
    for (const [x, z] of [[-2, -1], [-2, 0], [1, -1], [1, 0], [-1, -2], [0, -2], [-1, 1], [0, 1]]) b.set(x, 0, z, wood)
    // Roots snaking out across the floor
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      const len = 3 + b.rng.int(0, 2)
      for (let i = 2; i <= len; i++) b.set(Math.round(dx * i) - (dx < 0 ? 1 : 0), i > len - 1 ? -1 : 0, Math.round(dz * i) - (dz < 0 ? 1 : 0), wood)
    }
    // Boughs and their canopy
    const leaves = mix(b, 142, [[B.MOSSY_STONE, 50], [B.ANDESITE, 25], [B.CELESTITE_BLOCK, 18], [B.STONE, 7]])
    const turn = b.rng.next() * Math.PI * 2
    for (let k = 0; k < 5; k++) {
      const a = turn + (k * Math.PI * 2) / 5
      const len = 4 + b.rng.int(0, 2)
      let ex = 0, ey = 0, ez = 0
      for (let i = 1; i <= len; i++) {
        ex = Math.round(Math.cos(a) * i)
        ez = Math.round(Math.sin(a) * i)
        ey = 6 + Math.floor(i / 2) + (k % 2)
        b.set(ex, ey, ez, wood)
      }
      b.ellipsoid(ex, ey + 1, ez, 2.2, 1.5, 2.2, leaves, 0.2, PoiBuilder.open)
    }
    b.ellipsoid(0, 10, 0, 2.6, 1.8, 2.6, leaves, 0.2, PoiBuilder.open)
    hangFromCeiling(b, -7, -7, 7, 7, 2, 12, 143, (h) => (h < 0.08 ? B.HANGING_CELESTITE : h < 0.2 ? B.CAVE_VINES : 0))
    scatter(b, -7, -7, 7, 7, 0, 144, (h) => (h < 0.1 ? B.CAVE_FERN : h < 0.16 ? B.GLOW_BLOOM : 0))
    b.chest(2, 0, 2, FRONT)
    b.keystone(0, -2, 0)
  },
}

/** A perfect ring of glowing mushrooms on a mossy floor, something waiting in the middle. */
export const FAIRY_RING: PoiBuildDef = {
  kind: getPoiKind('fairy_ring'),
  radius: 7, above: 5, below: 2,
  build(b) {
    b.chamber(0, 2, 0, 6.4, 3.6, 6.4, 0, B.STONE, 0.14)
    for (let z = -6; z <= 6; z++) {
      for (let x = -6; x <= 6; x++) {
        const d = dist(x, z)
        if (d > 6) continue
        b.set(x, -1, z, d >= 3.4 && d <= 4.6 ? B.GLOWMOSS : b.hash(x, -1, z, 151) < 0.7 ? B.MOSS : B.MOSSY_STONE)
        if (d >= 3.4 && d <= 4.6) {
          const h = b.hash(x, 0, z, 152)
          const id = h < 0.45 ? B.GLIMMERCAP : h < 0.6 ? B.PUFFBALLS : h < 0.75 ? B.TOADSTOOL : h < 0.88 ? B.CAVE_MUSHROOMS : 0
          if (id) b.set(x, 0, z, id)
        } else if (d > 1.4) {
          const h = b.hash(x, 0, z, 153)
          if (h < 0.1) b.set(x, 0, z, B.CAVE_FERN)
          else if (h < 0.14 && d < 3.4) b.set(x, 0, z, B.GLOW_BLOOM)
        }
      }
    }
    b.chest(0, 0, 0, FRONT)
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (b.hash(x, 0, z, 154) < 0.6) b.set(x, 0, z, B.GOLD_COINS)
    hangFromCeiling(b, -5, -5, 5, 5, 1, 6, 155, (h) => (h < 0.12 ? B.HANGING_ROOTS : 0))
    b.keystone(0, -2, 0)
  },
}

/** A garden in the dark under a crystal sun: moss, ferns, a lily pond, glowing vines. */
export const HIDDEN_GARDEN: PoiBuildDef = {
  kind: getPoiKind('hidden_garden'),
  radius: 8, above: 8, below: 3,
  build(b) {
    b.chamber(0, 3, 0, 7.6, 4.8, 7.6, 0, B.DIRT, 0.14)
    for (let z = -7; z <= 7; z++) {
      for (let x = -7; x <= 7; x++) {
        if (dist(x, z) > 7.2) continue
        const h = b.hash(x, -1, z, 161)
        b.set(x, -1, z, h < 0.5 ? B.MOSS : h < 0.8 ? B.GRASS : B.GLOWMOSS)
      }
    }
    // The pond
    for (let z = -4; z <= 0; z++) {
      for (let x = 1; x <= 5; x++) {
        if (dist(x, z, 3, -2) > 1.9) continue
        b.set(x, -1, z, B.WATER)
        b.set(x, -2, z, B.CLAY)
        const h = b.hash(x, 0, z, 162)
        if (h < 0.25) b.set(x, 0, z, h < 0.1 ? B.WATER_LILY : B.LILY_PAD)
      }
    }
    // The crystal sun in the ceiling
    const sun = b.ellipsoidTop(0, 3, 0, 7.6, 4.8, 7.6, 0.14, 0, 0)
    if (sun <= 8 && !b.isCave(0, sun, 0)) b.set(0, sun, 0, B.CELESTITE_LAMP)
    scatter(b, -6, -6, 6, 6, 0, 163, (h, x, z) => {
      if (dist(x, z, 3, -2) < 2.4) return 0
      return h < 0.14 ? B.CAVE_FERN : h < 0.22 ? B.GLOW_BLOOM : h < 0.26 ? B.LUMEN_FERN : h < 0.3 ? B.BRACKEN : h < 0.32 ? B.ORCHID : 0
    })
    hangFromCeiling(b, -6, -6, 6, 6, 1, 8, 164, (h) => (h < 0.1 ? B.CAVE_VINES_BERRIES : h < 0.18 ? B.HANGING_ROOTS : h < 0.24 ? B.CAVE_VINES : 0))
    b.chest(-3, 0, -3, FRONT)
    b.keystone(0, -2, 0)
  },
}

/** An island shrine in a still underground pool, lit by celestite lamps. */
export const SUNKEN_SHRINE: PoiBuildDef = {
  kind: getPoiKind('sunken_shrine'),
  radius: 9, above: 8, below: 4,
  build(b) {
    b.chamber(0, 3, 0, 8.6, 4.8, 8.6, 0, B.STONE, 0.12)
    for (let z = -8; z <= 8; z++) {
      for (let x = -8; x <= 8; x++) {
        const d = dist(x, z)
        if (d > 8) continue
        if (d <= 6.6) {
          b.set(x, -1, z, B.WATER)
          b.set(x, -2, z, B.WATER)
          b.set(x, -3, z, b.hash(x, -3, z, 171) < 0.6 ? B.SAND : B.GRAVEL)
          b.foundation(x, z, -4, B.STONE, 1)
        } else {
          b.set(x, -1, z, B.ANCIENT_TILES)
          b.set(x, -2, z, B.STONE)
          b.set(x, -3, z, B.STONE)
        }
      }
    }
    // The island and its shrine
    for (let z = -2; z <= 2; z++) {
      for (let x = -2; x <= 2; x++) {
        const d = dist(x, z)
        if (d > 2.3) continue
        b.fill(x, -2, z, x, -1, z, B.ANCIENT_BRICKS)
        if (d <= 1.5) b.set(x, 0, z, B.ANCIENT_TILES)
      }
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.fill(x, 1, z, x, 2, z, B.ANCIENT_BRICKS)
      b.set(x, 3, z, B.CELESTITE_LAMP)
    }
    b.set(0, 1, 0, B.CARVED_ANCIENT_BRICKS)
    b.set(0, 2, 0, B.GOLDEN_IDOL, b.facing(FRONT))
    b.chest(0, 1, -1, FRONT)
    // Stepping stones from the shore
    for (const [x, z] of [[0, 3], [1, 5], [0, 7]]) b.set(x, -1, z, B.ANCIENT_TILES)
    scatter(b, -6, -6, 6, 6, 0, 172, (h, x, z) => {
      const d = dist(x, z)
      return d > 2.6 && d < 6.4 && h < 0.04 ? B.LILY_PAD : 0
    }, (id) => id === B.AIR)
    b.keystone(0, -4, 0)
  },
}

export const NATURE_KINDS: readonly PoiBuildDef[] = [GIANT_GEODE, GIANT_FOSSIL, PETRIFIED_TREE, FAIRY_RING, HIDDEN_GARDEN, SUNKEN_SHRINE]
