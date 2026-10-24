import { getPoiKind } from '../PoiCatalog.ts'
import { CAVE_DRAKE_INDEX } from '../../../../../entities/guardians/cave_drake/caveDrakeIds.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, masonry, mix, scatter, weighted } from './shared.ts'

/** Treasure: hoards, caches, a wishing well, a seam of ore, and a dragon's lair. */

/** Height (blocks) of a gold mound column: 0 outside it. */
function moundHeight(b: PoiBuilder, x: number, z: number, cx: number, cz: number, rx: number, rz: number, peak: number, salt: number): number {
  const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
  if (d >= 1) return 0
  return Math.max(1, Math.round(peak * (1 - d) + (b.hash(x, 0, z, salt) - 0.5) * 0.8))
}

/** A low mound of heaped gold (local centre, radii, peak height in blocks), decorated on top. */
function goldMound(b: PoiBuilder, cx: number, cz: number, rx: number, rz: number, peak: number, salt: number): void {
  for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const h = moundHeight(b, x, z, cx, cz, rx, rz, peak, salt)
      if (h === 0) continue
      b.fill(x, 0, z, x, h - 1, z, B.HEAPED_GOLD)
      const top = b.hash(x, h, z, salt + 1)
      if (top < 0.18) b.set(x, h, z, B.TREASURE_HOARD, b.facing(FRONT))
      else if (top < 0.42) b.set(x, h, z, B.GOLD_COINS)
    }
  }
}

/** A thief's last stash: a heap of gold in a grotto, and the thief's bones beside it. */
export const LOST_HOARD: PoiBuildDef = {
  kind: getPoiKind('lost_hoard'),
  radius: 7, above: 6, below: 3,
  build(b) {
    b.chamber(0, 2, -1, 5.6, 3.6, 5.2, 0, B.STONE)
    scatter(b, -5, -6, 5, 4, -1, 81, (h) => (h < 0.25 ? B.GRAVEL : 0), PoiBuilder.natural)
    goldMound(b, 0, -3.5, 2.8, 1.9, 2.2, 82)
    b.chest(2, 0, -2, F.WEST)
    scatter(b, -4, -6, 4, 0, 0, 83, (h, x, z) => (dist(x, z, 0, -3.5) > 2.4 && h < 0.3 ? B.GOLD_COINS : 0))
    // The thief
    b.set(-2, 0, -1, B.SKULL, b.facing(F.EAST))
    b.set(-3, 0, -2, B.BONE_PILE)
    b.set(-2, 0, 0, B.CAVE_BONES)
    b.set(-1, 0, 1, B.MINERS_LANTERN)
    b.keystone(0, -2, -2)
  },
}

/** A smugglers' storeroom behind a plank wall and a door. */
export const SMUGGLERS_CACHE: PoiBuildDef = {
  kind: getPoiKind('smugglers_cache'),
  radius: 7, above: 6, below: 3,
  build(b) {
    // Rough rock walls (holes patched), a timber-framed room inside
    b.fillIf(-4, -1, -7, 4, 4, -1, B.STONE, PoiBuilder.open)
    b.fill(-3, 0, -6, 3, 3, -2, B.AIR)
    b.fill(-3, -1, -6, 3, -1, -2, B.OAK_PLANKS)
    for (const x of [-3, 3]) for (const z of [-6, -2]) b.fill(x, 0, z, x, 3, z, B.OAK_LOG)
    b.fill(-3, 3, -4, 3, 3, -4, B.OAK_PLANKS)
    // The plank wall and its door, a little clearing in front
    b.fill(-3, 0, -1, 3, 3, -1, B.OAK_PLANKS)
    b.set(0, 0, -1, B.OAK_DOOR, b.facing(F.SOUTH))
    b.set(0, 1, -1, B.OAK_DOOR_UPPER, b.facing(F.SOUTH))
    b.fill(-2, 0, 0, 2, 3, 2, B.AIR)
    b.floor(-2, 0, 2, 2, -1, B.GRAVEL)
    // The goods
    b.set(-3, 0, -5, B.BARREL)
    b.set(-2, 0, -6, B.BARREL)
    b.set(-3, 0, -6, B.BARREL)
    b.set(-3, 1, -6, B.BARREL)
    b.set(-3, 2, -6, B.MINERS_LANTERN)
    b.set(3, 0, -6, B.ORE_CRATE)
    b.set(3, 1, -6, B.ORE_CRATE)
    b.set(3, 0, -5, B.ORE_CRATE)
    b.set(2, 0, -6, B.TNT)
    b.chest(-1, 0, -6, FRONT)
    b.chest(1, 0, -6, FRONT)
    b.set(2, 0, -3, B.OAK_TABLE)
    b.set(2, 1, -3, B.BOOK_PILE, b.facing(F.WEST))
    b.set(1, 0, -3, B.OAK_CHAIR, b.facing(F.EAST))
    b.set(-2, 0, -3, B.GOLD_COINS)
    b.keystone(0, -2, -4)
  },
}

/** An old well, coins glinting at the bottom of the water. */
export const WISHING_WELL: PoiBuildDef = {
  kind: getPoiKind('wishing_well'),
  radius: 5, above: 8, below: 6,
  build(b) {
    const wall = masonry(b, 0.25, 0.12)
    b.chamber(0, 3, 0, 4.6, 4.6, 4.6, 0, B.STONE, 0.12)
    for (let z = -4; z <= 4; z++) {
      for (let x = -4; x <= 4; x++) if (dist(x, z) <= 4.3) b.set(x, -1, z, b.hash(x, -1, z, 91) < 0.15 ? B.MOSSY_STONE : B.ANCIENT_TILES)
    }
    // The shaft: brick walls down to a floor of gold, water to the brim
    b.fill(-2, -5, -2, 2, 0, 2, wall)
    b.fill(-1, -5, -1, 1, -5, 1, B.HEAPED_GOLD)
    b.fill(-1, -4, -1, 1, -1, 1, B.WATER)
    b.fill(-1, 0, -1, 1, 0, 1, B.AIR)
    // Posts, a beam and a little roof
    b.fill(-2, 1, 0, -2, 3, 0, B.OAK_FENCE)
    b.fill(2, 1, 0, 2, 3, 0, B.OAK_FENCE)
    b.fill(-2, 4, 0, 2, 4, 0, B.OAK_PLANKS)
    b.fill(-2, 5, -1, 2, 5, 1, B.OAK_SLAB)
    b.set(-2, 1, -2, B.MINERS_LANTERN)
    b.set(2, 1, 2, B.MINERS_LANTERN)
    for (const [x, z] of [[-1, -2], [2, -1], [1, 2], [-2, 1]]) if (b.hash(x, 1, z, 92) < 0.6) b.set(x, 1, z, B.GOLD_COINS)
    b.chest(3, 0, -2, F.WEST)
    b.keystone(3, -2, 0)
  },
}

/** A pocket where the walls glitter with ore. */
export const MOTHER_LODE: PoiBuildDef = {
  kind: getPoiKind('mother_lode'),
  radius: 6, above: 6, below: 4,
  build(b) {
    b.chamber(0, 2, 0, 5, 3.3, 5, 0, B.STONE)
    const ore = (x: number, y: number, z: number): number =>
      weighted(b.hash(x, y, z, 101), [[B.COAL_BLOCK, 18], [B.IRON_BLOCK, 16], [B.COPPER_BLOCK, 11], [B.GOLD_BLOCK, 8], [B.DIAMOND_BLOCK, 3], [B.STONE, 36]])
    b.ellipsoid(0, 2, 0, 6.4, 4.6, 6.4, ore, 0.1, PoiBuilder.natural)
    scatter(b, -4, -4, 4, 4, 0, 102, (h) => (h < 0.04 ? B.CELESTITE_BUD : h < 0.08 ? B.PEBBLES : 0))
    hangFromCeiling(b, -4, -4, 4, 4, 1, 6, 103, (h) => (h < 0.05 ? B.HANGING_CELESTITE : 0))
    b.keystone(0, -3, 0)
  },
}

/**
 * A dragon's lair: a vast scorched cavern, a mountain of gold with eggs on
 * it, the bones of the old dragon in front - and the Cave Drake asleep on
 * its altar at the summit, until someone walks in.
 */
export const DRAGONS_LAIR: PoiBuildDef = {
  kind: getPoiKind('dragons_lair'),
  radius: 18, above: 15, below: 4,
  build(b) {
    // Scorched walls, then the cavern
    const scorch = mix(b, 111, [[B.BASALT, 60], [B.SMOLDERING_STONE, 14], [B.OBSIDIAN, 6], [B.MAGMA, 4], [B.STONE, 16]])
    b.ellipsoid(0, 4, -1, 17, 11.5, 15, scorch, 0.12, PoiBuilder.natural)
    b.chamber(0, 4, -1, 15, 9.5, 12.8, 0, B.BASALT, 0.16)
    for (let z = -14; z <= 12; z++) {
      for (let x = -15; x <= 15; x++) {
        if ((x / 15) ** 2 + ((z + 1) / 12.8) ** 2 > 1) continue
        b.set(x, -1, z, weighted(b.hash(x, -1, z, 112), [[B.BASALT, 70], [B.SMOLDERING_STONE, 12], [B.MAGMA, 7], [B.OBSIDIAN, 5]]))
      }
    }
    // Two pools of lava sunk in the floor
    for (const [px, pz] of [[10, -7], [-11, -3]]) {
      for (let z = pz - 2; z <= pz + 2; z++) {
        for (let x = px - 2; x <= px + 2; x++) {
          if (dist(x, z, px, pz) > 1.7) continue
          b.set(x, -1, z, B.LAVA)
          b.set(x, -2, z, B.BASALT)
        }
      }
    }
    // The hoard, the drake's altar on its summit (it sleeps on its gold), eggs about it
    goldMound(b, 0, -6, 7, 5, 3.4, 113)
    b.fill(0, 0, -6, 0, 3, -6, B.HEAPED_GOLD)
    b.guardian(0, 4, -6, CAVE_DRAKE_INDEX)
    b.fill(0, 5, -6, 0, 7, -6, B.AIR)
    for (const [x, z] of [[-2, -6], [2, -7], [1, -4]]) b.set(x, moundHeight(b, x, z, 0, -6, 7, 5, 3.4, 113), z, B.DRAGON_EGG)
    scatter(b, -10, -13, 10, 1, 0, 114, (h, x, z) => {
      const d = ((x / 7) ** 2 + ((z + 6) / 5) ** 2)
      return d >= 1 && d < 2.2 && h < 0.35 ? B.GOLD_COINS : 0
    })
    b.chest(-7, 0, -6, F.EAST)
    b.chest(7, 0, -5, F.WEST)
    b.chest(0, 0, -12, FRONT)
    // The old dragon: spine along x in front of the hoard, ribs arching over it
    const bone = B.FOSSIL_BONE
    const sz = 3
    for (let x = -12; x <= 9; x++) {
      const tail = x < -3
      const y = x > 6 ? 1 + Math.min(2, x - 6) : tail ? 0 : 1
      const z = tail ? sz + Math.round(Math.sin((x + 3) * 0.45) * 1.6) : sz
      b.set(x, y, z, bone)
      if (!tail) b.set(x, y - 1, z, bone)
    }
    for (let x = -2; x <= 6; x += 2) {
      for (let u = -3; u <= 3; u++) {
        const y = Math.round(Math.sqrt(9 - u * u) * 1.1)
        if (b.hash(x, y, u, 115) < 0.12) continue
        b.set(x, y, sz + u, bone)
      }
    }
    // Skull at the end of the neck
    b.fill(10, 1, sz - 1, 13, 3, sz + 1, bone)
    b.fill(14, 1, sz - 1, 14, 2, sz + 1, bone)
    b.set(11, 3, sz - 1, B.AIR)
    b.set(11, 3, sz + 1, B.AIR)
    b.fill(11, 0, sz - 1, 14, 0, sz + 1, bone)
    b.fill(12, 1, sz, 14, 1, sz, B.AIR)
    for (const s of [-1, 1]) {
      b.set(10, 4, sz + s, bone)
      b.set(9, 5, sz + s * 2, bone)
    }
    // A wing laid back over the hoard, the other spread toward the cave
    for (let i = 0; i <= 6; i++) {
      b.set(4 - i, 2 + Math.round(Math.sin((i / 6) * Math.PI) * 2), sz - 2 - i, bone)
      b.set(4 - Math.round(i * 0.6), 1 + Math.round(Math.sin((i / 6) * Math.PI) * 1.5), sz + 2 + i, bone)
    }
    // Legs
    for (const [x, s] of [[0, -1], [0, 1], [5, -1], [5, 1]]) b.fill(x, 0, sz + s * 2, x, 0, sz + s * 3, bone)
    // Those who came before
    scatter(b, -12, 4, 12, 11, 0, 116, (h) => (h < 0.025 ? B.SKULL : h < 0.06 ? B.CAVE_BONES : h < 0.08 ? B.BONE_PILE : h < 0.13 ? B.CINDERS : h < 0.16 ? B.EMBERS : 0))
    scatter(b, -14, -13, 14, 3, 0, 117, (h) => (h < 0.04 ? B.CINDERS : h < 0.06 ? B.VOLCANIC_ROCKS : 0))
    b.keystone(0, -2, -6)
  },
}

export const TREASURE_KINDS: readonly PoiBuildDef[] = [LOST_HOARD, SMUGGLERS_CACHE, WISHING_WELL, MOTHER_LODE, DRAGONS_LAIR]
