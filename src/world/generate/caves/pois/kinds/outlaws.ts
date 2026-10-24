import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, hangFromCeiling, mix, scatter, weighted } from './shared.ts'

/** People and peril: a bandit hideout, a cave-in, an excavation, a tavern of the deep roads, a mushroom village. */

/** A log lying along local X (or Z): the fallen pine logs are world-axis blocks, so the site's rotation picks one. */
function fallenLog(b: PoiBuilder, alongX: boolean): number {
  return (b.site.rotation % 2 === 0) === alongX ? B.FALLEN_PINE_LOG_X : B.FALLEN_PINE_LOG_Z
}

/** Ancient bricks by position: mostly plain, some mossy and cracked. */
function brick(b: PoiBuilder, x: number, y: number, z: number): number {
  const h = b.hash(x, y, z, 31)
  return h < 0.12 ? B.MOSSY_ANCIENT_BRICKS : h < 0.22 ? B.CRACKED_ANCIENT_BRICKS : B.ANCIENT_BRICKS
}

/** A bandit camp behind a log palisade: a fire, bedrolls, stolen goods and a lookout over the gate. */
export const BANDIT_HIDEOUT: PoiBuildDef = {
  kind: getPoiKind('bandit_hideout'),
  radius: 10, above: 8, below: 3,
  build(b) {
    b.chamber(0, 2, -2, 9.6, 5.8, 9, 0, B.STONE, 0.15)
    scatter(b, -9, -10, 9, 7, -1, 301, (h) => (h < 0.3 ? B.DIRT : h < 0.45 ? B.GRAVEL : 0), PoiBuilder.natural)
    // The palisade: logs of uneven height, the odd stake on top, rounded corners and a gate in front
    const X0 = -6, X1 = 6, Z0 = -8, Z1 = 3
    b.fill(X0 + 1, 0, Z0 + 1, X1 - 1, 3, Z1 - 1, B.AIR)
    b.floor(X0, Z0, X1, Z1, -1, mix(b, 304, [[B.DIRT, 5], [B.GRAVEL, 3], [B.STONE, 2]]))
    for (let z = Z0; z <= Z1; z++) {
      for (let x = X0; x <= X1; x++) {
        if (x !== X0 && x !== X1 && z !== Z0 && z !== Z1) continue
        if ((x === X0 || x === X1) && (z === Z0 || z === Z1)) continue
        if (z === Z1 && Math.abs(x) <= 1) continue
        const h = 2 + (b.hash(x, 0, z, 302) < 0.55 ? 1 : 0)
        b.fill(x, 0, z, x, h - 1, z, B.OAK_LOG)
        if (b.hash(x, 1, z, 303) < 0.3) b.set(x, h, z, B.OAK_FENCE)
      }
    }
    // Gate posts, taller, with torches
    for (const x of [-2, 2]) {
      b.fill(x, 0, Z1, x, 3, Z1, B.OAK_LOG)
      b.set(x, 4, Z1, B.TORCH)
    }
    // The fire and the bedrolls round it
    b.set(0, 0, -2, B.CAMPFIRE)
    b.set(-2, 0, -2, B.BEDROLL, b.facing(F.EAST))
    b.set(2, 0, -2, B.BEDROLL, b.facing(F.WEST))
    b.set(0, 0, -4, B.BEDROLL, b.facing(F.SOUTH))
    b.set(-2, 0, -4, B.BEDROLL, b.facing(F.EAST))
    // The counting table: tankards and the takings
    b.set(3, 0, -6, B.OAK_TABLE)
    b.set(4, 0, -6, B.OAK_TABLE)
    b.set(3, 1, -6, B.TANKARDS, b.facing(FRONT))
    b.set(4, 1, -6, B.GOLD_COINS)
    b.set(3, 0, -5, B.OAK_CHAIR, b.facing(F.NORTH))
    b.set(4, 0, -7, B.OAK_CHAIR, b.facing(F.SOUTH))
    // Stolen goods against the back of the palisade
    b.set(-5, 0, -7, B.BARREL)
    b.set(-4, 0, -7, B.BARREL)
    b.set(-5, 1, -7, B.BARREL)
    b.set(-5, 0, -6, B.BARREL)
    b.set(-3, 0, -7, B.ORE_CRATE)
    b.set(-2, 0, -7, B.ORE_CRATE)
    b.set(-3, 1, -7, B.ORE_CRATE)
    b.chest(-1, 0, -7, FRONT)
    b.chest(5, 0, -4, F.WEST)
    // Arms
    b.set(-5, 0, -3, B.WEAPON_RACK, b.facing(F.EAST))
    b.set(-5, 0, -1, B.WEAPON_RACK, b.facing(F.EAST))
    // The lookout over the gate: a plank platform on log posts, a ladder up, a railing and a lantern
    for (const [x, z] of [[3, 1], [5, 1], [3, 2], [5, 2]]) b.fill(x, 0, z, x, 2, z, B.OAK_LOG)
    b.fill(3, 3, 1, 5, 3, 2, B.OAK_PLANKS)
    for (let y = 0; y <= 3; y++) b.set(3, y, 0, B.LADDER, b.facing(F.NORTH))
    for (const [x, z] of [[3, 2], [4, 2], [5, 2], [5, 1]]) b.set(x, 4, z, B.OAK_FENCE)
    b.set(4, 4, 1, B.MINERS_LANTERN)
    b.set(-5, 0, 1, B.TORCH)
    scatter(b, -5, -7, 5, 2, 0, 305, (h, x, z) => (Math.abs(x) <= 1 && z >= -3 && z <= -1 ? 0 : h < 0.04 ? B.TWIGS : h < 0.07 ? B.PEBBLES : 0))
    scatter(b, -7, 4, 7, 8, 0, 306, (h) => (h < 0.06 ? B.PEBBLES : h < 0.08 ? B.CAVE_BONES : 0))
    hangFromCeiling(b, -8, -9, 8, 7, 3, 8, 307, (h) => (h < 0.04 ? B.HANGING_ROOTS : 0))
    b.keystone(0, -2, -3)
  },
}

/** A mine tunnel that came down: a slope of rubble, snapped supports, a buried cart and someone who didn't get out. */
export const CAVE_IN: PoiBuildDef = {
  kind: getPoiKind('cave_in'),
  radius: 10, above: 6, below: 2,
  build(b) {
    // The tunnel runs back into the rock from a little hollow in the cave: 4 wide (supports at its sides), 4 high
    const X0 = -2, X1 = 1, ZB = -10
    b.chamber(0, 2, 6, 4.2, 2.8, 3.6, 0, B.GRAVEL, 0.15)
    b.fillIf(X0 - 1, -1, ZB, X1 + 1, 4, 3, B.STONE, PoiBuilder.open)
    b.fill(X0, 0, ZB + 1, X1, 3, 5, B.AIR)
    b.floor(X0, ZB + 1, X1, 5, -1, mix(b, 311, [[B.GRAVEL, 4], [B.STONE, 4], [B.DIRT, 2]]))
    // Post-and-beam supports; the one at the edge of the fall is broken
    const beam = fallenLog(b, true)
    for (const z of [3, -1, -5, -9]) {
      b.fill(X0, 0, z, X0, 2, z, B.OAK_LOG)
      if (z === -1) {
        b.set(X1, 0, z, B.OAK_FENCE)
        continue
      }
      b.fill(X1, 0, z, X1, 2, z, B.OAK_LOG)
      b.fill(X0, 3, z, X1, 3, z, beam)
    }
    // The rubble: a slope from the floor up to the roof, solid beyond
    const rubble = mix(b, 312, [[B.GRAVEL, 5], [B.STONE, 3], [B.ANDESITE, 1], [B.DIRT, 1]])
    for (let z = ZB + 1; z <= 1; z++) {
      for (let x = X0; x <= X1; x++) {
        const base = z >= 1 ? 0 : z >= -2 ? 1 : z === -3 ? 2 : z === -4 ? 3 : 4
        const j = b.hash(x, 0, z, 313)
        let h = base + (z <= -3 && z >= -4 ? (j < 0.3 ? 1 : j > 0.75 ? -1 : 0) : 0)
        if (z >= 0) h = j < 0.3 ? 1 : 0
        if (z === -2) h = 1
        h = Math.max(0, Math.min(4, h))
        for (let y = 0; y < h; y++) b.setIf(x, y, z, rubble, PoiBuilder.open)
      }
    }
    // The fallen beam lies across the rubble
    b.fill(X0, 1, -2, X1, 1, -2, beam)
    // Half-buried cart and crates, the chest under a fall of gravel
    b.set(-1, 0, -1, B.MINECART, b.facing(F.EAST))
    b.chest(1, 0, 0, FRONT)
    b.set(1, 1, 0, B.GRAVEL)
    b.set(1, 0, 2, B.ORE_CRATE)
    b.set(1, 1, 2, B.ORE_CRATE)
    b.set(-2, 0, 1, B.ORE_CRATE)
    // Someone who didn't get out
    b.set(0, 0, 1, B.BONE_PILE)
    b.set(-1, 0, 1, B.SKULL, b.facing(F.EAST))
    b.set(0, 1, -1, B.CAVE_BONES)
    // The light they left
    b.set(-2, 0, 2, B.TORCH)
    b.set(1, 0, 4, B.MINERS_LANTERN)
    scatter(b, -2, 2, 1, 5, 0, 314, (h) => (h < 0.12 ? B.PEBBLES : 0))
    b.keystone(0, -2, 0)
  },
}

/** An archaeological dig: a terraced pit roped off with fences, a find half out of the ground, finds laid out by the tents. */
export const EXCAVATION_SITE: PoiBuildDef = {
  kind: getPoiKind('excavation_site'),
  radius: 10, above: 7, below: 5,
  build(b) {
    b.chamber(0, 2, -1, 9.6, 5.2, 9, 0, B.STONE, 0.14)
    scatter(b, -9, -10, 9, 8, -1, 331, (h) => (h < 0.3 ? B.DIRT : h < 0.45 ? B.GRAVEL : 0), PoiBuilder.natural)
    // The pit, dug into solid ground (rock fills any cave under it): an outer terrace and a deeper inner one
    const outer = (x: number, z: number): boolean => Math.abs(x) <= 5 && z >= -5 && z <= 3
    const inner = (x: number, z: number): boolean => Math.abs(x) <= 3 && z >= -3 && z <= 1
    const soil = mix(b, 332, [[B.DIRT, 5], [B.GRAVEL, 3], [B.SAND, 2]])
    b.fillIf(-6, -5, -6, 6, -1, 4, B.STONE, PoiBuilder.open)
    for (let z = -5; z <= 3; z++) {
      for (let x = -5; x <= 5; x++) {
        b.set(x, -1, z, B.AIR)
        if (inner(x, z)) {
          b.fill(x, -3, z, x, -2, z, B.AIR)
          b.set(x, -4, z, soil)
        } else if (outer(x, z)) {
          b.set(x, -2, z, soil)
        }
      }
    }
    // A plank walk across the pit on log posts
    for (let x = -5; x <= 5; x++) b.set(x, -1, 0, B.OAK_PLANKS)
    for (const x of [-2, 2]) b.fill(x, -3, 0, x, -2, 0, B.OAK_LOG)
    // A ladder down to the inner terrace
    b.set(-2, -3, 1, B.LADDER, b.facing(F.NORTH))
    b.set(-2, -2, 1, B.LADDER, b.facing(F.NORTH))
    // The find, half out of the ground
    if (b.hash(0, 0, 0, 335) < 0.5) {
      // A great skeleton: spine, ribs, a skull in the east wall, a tail running into the west one
      for (let x = -3; x <= 2; x++) b.set(x, -3, -2, B.FOSSIL_BONE)
      for (const x of [-2, 0, 2]) {
        b.set(x, -3, -3, B.FOSSIL_BONE)
        b.set(x, -3, -1, B.FOSSIL_BONE)
        b.set(x, -2, -3, B.FOSSIL_BONE)
        b.set(x, -2, -1, B.FOSSIL_BONE)
      }
      b.fill(3, -3, -3, 3, -2, -2, B.FOSSIL_BONE)
      b.set(4, -3, -2, B.FOSSIL_BONE)
      b.set(4, -2, -2, B.FOSSIL_BONE)
      b.set(-4, -3, -2, B.FOSSIL_BONE)
      b.set(-5, -2, -2, B.FOSSIL_BONE)
      b.set(1, -3, 1, B.SKULL, b.facing(F.WEST))
    } else {
      // The corner of a buried building: brick walls, a carved course, an idol in the doorway's niche
      for (let x = -3; x <= 1; x++) {
        b.fill(x, -3, -3, x, -2, -3, (x2, y, z) => (y === -2 ? B.CARVED_ANCIENT_BRICKS : brick(b, x2, y, z)))
      }
      for (let z = -2; z <= 1; z++) {
        if (z === -1) continue
        b.fill(-3, -3, z, -3, -2, z, (x, y, z2) => (y === -2 ? B.CARVED_ANCIENT_BRICKS : brick(b, x, y, z2)))
      }
      b.fill(-2, -4, -2, 1, -4, -1, B.ANCIENT_TILES)
      b.set(-1, -3, -2, B.GOLDEN_IDOL, b.facing(FRONT))
      b.set(0, -3, -1, B.FUNERARY_URN)
    }
    // Rope it off: a fence round the rim (gaps at the front and the walk's ends), lanterns at the corners
    for (let z = -6; z <= 4; z++) {
      for (let x = -6; x <= 6; x++) {
        if (Math.abs(x) !== 6 && z !== -6 && z !== 4) continue
        if ((z === 4 && x === 0) || (Math.abs(x) === 6 && z === 0)) continue
        b.set(x, 0, z, B.OAK_FENCE)
      }
    }
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 4], [6, 4]]) b.set(x, 1, z, B.MINERS_LANTERN)
    // The finds laid out on the sifting tables, crates of sifted earth
    b.set(7, 0, -3, B.OAK_TABLE)
    b.set(7, 0, -2, B.OAK_TABLE)
    b.set(7, 1, -3, B.BOOK_PILE, b.facing(F.WEST))
    b.set(7, 1, -2, B.SKULL, b.facing(F.WEST))
    b.set(7, 0, 0, B.FUNERARY_URN)
    b.set(8, 0, -1, B.GOLDEN_IDOL, b.facing(F.WEST))
    b.set(8, 0, -4, B.ORE_CRATE)
    b.set(8, 1, -4, B.ORE_CRATE)
    b.set(7, 0, -5, B.BARREL)
    b.chest(7, 0, -4, F.WEST)
    // The diggers' camp
    b.set(-8, 0, -2, B.BEDROLL, b.facing(F.EAST))
    b.set(-8, 0, 0, B.BEDROLL, b.facing(F.EAST))
    b.set(-8, 0, -4, B.MINERS_LANTERN)
    b.set(-7, 0, 2, B.CINDERS)
    scatter(b, -9, -9, 9, 7, 0, 336, (h, x, z) => (Math.abs(x) <= 6 && z >= -6 && z <= 4 ? 0 : h < 0.05 ? B.PEBBLES : h < 0.07 ? B.CAVE_BONES : 0))
    b.keystone(0, -5, -1)
  },
}

/** A tavern on the deep roads: a timber and stone front, a bar, barrels, tables by the hearth, beds in the back. */
export const DEEPWAY_TAVERN: PoiBuildDef = {
  kind: getPoiKind('deepway_tavern'),
  radius: 10, above: 6, below: 3,
  build(b) {
    // A clearing in front of the door
    b.chamber(0, 2, 5, 6.6, 3, 3.6, 0, B.GRAVEL, 0.15)
    // The house: stone footing, plank walls in a log frame, a plank floor and roof
    const X0 = -6, X1 = 6, Z0 = -8, Z1 = 1, H = 3
    for (let y = -1; y <= H + 1; y++) {
      for (let z = Z0 - 1; z <= Z1 + 1; z++) {
        for (let x = X0 - 1; x <= X1 + 1; x++) {
          const wall = x < X0 || x > X1 || z < Z0 || z > Z1
          if (y === H + 1) {
            b.set(x, y, z, B.OAK_PLANKS)
            continue
          }
          if (y === -1) {
            b.set(x, y, z, wall ? brick(b, x, y, z) : B.OAK_PLANKS)
            b.foundation(x, z, -2, B.STONE, 4)
            continue
          }
          if (!wall) {
            b.set(x, y, z, B.AIR)
            continue
          }
          const corner = (x === X0 - 1 || x === X1 + 1) && (z === Z0 - 1 || z === Z1 + 1)
          const post = ((z === Z0 - 1 || z === Z1 + 1) && Math.abs(x) === 3) || ((x === X0 - 1 || x === X1 + 1) && z === -4)
          b.set(x, y, z, corner || post ? B.OAK_LOG : y === 0 ? brick(b, x, y, z) : B.OAK_PLANKS)
        }
      }
    }
    // Door, windows, lanterns either side of the door
    b.set(0, 0, Z1 + 1, B.OAK_DOOR, b.facing(F.SOUTH))
    b.set(0, 1, Z1 + 1, B.OAK_DOOR_UPPER, b.facing(F.SOUTH))
    for (const x of [-5, -4, 4, 5]) b.set(x, 1, Z1 + 1, B.OAK_WINDOW)
    b.set(X0 - 1, 1, -1, B.OAK_WINDOW)
    b.set(X0 - 1, 1, -6, B.OAK_WINDOW)
    for (const x of [-2, 2]) {
      b.set(x, 0, Z1 + 2, B.OAK_FENCE)
      b.set(x, 1, Z1 + 2, B.MINERS_LANTERN)
    }
    b.set(4, 0, Z1 + 2, B.BARREL)
    b.set(5, 0, Z1 + 2, B.BARREL)
    // The hearth in the east wall
    b.set(X1, 0, -3, B.CAMPFIRE)
    for (const z of [-4, -2]) b.fill(X1, 0, z, X1, 1, z, B.CARVED_ANCIENT_BRICKS)
    b.fill(X1, 2, -4, X1, 2, -2, B.CARVED_ANCIENT_BRICKS)
    b.fill(X1 + 1, 0, -3, X1 + 1, H, -3, B.ANCIENT_BRICKS)
    // The bar: a plank counter with a way round the end, barrels and the chest behind it
    for (let x = -4; x <= -1; x++) b.set(x, 0, -5, B.OAK_PLANKS)
    b.set(-1, 0, -6, B.OAK_PLANKS)
    b.set(-4, 1, -5, B.DUSTY_BOTTLES)
    b.set(-3, 1, -5, B.TANKARDS, b.facing(FRONT))
    b.set(-1, 1, -5, B.MINERS_LANTERN)
    b.set(-1, 1, -6, B.TANKARDS, b.facing(F.EAST))
    for (const x of [-4, -2]) b.set(x, 0, -4, B.OAK_CHAIR, b.facing(F.NORTH))
    for (const [x, y, z] of [[-6, 0, -8], [-5, 0, -8], [-4, 0, -8], [-6, 1, -8], [-5, 1, -8], [-6, 0, -7]]) b.set(x, y, z, B.BARREL)
    b.set(-4, 1, -8, B.DUSTY_BOTTLES)
    b.chest(-3, 0, -8, FRONT)
    // Tables with chairs and tankards
    b.set(3, 0, -1, B.OAK_TABLE)
    b.set(2, 0, -1, B.OAK_CHAIR, b.facing(F.EAST))
    b.set(4, 0, -1, B.OAK_CHAIR, b.facing(F.WEST))
    b.set(3, 1, -1, B.TANKARDS, b.facing(FRONT))
    b.set(3, 0, -4, B.OAK_TABLE)
    b.set(3, 0, -3, B.OAK_CHAIR, b.facing(F.NORTH))
    b.set(3, 0, -5, B.OAK_CHAIR, b.facing(F.SOUTH))
    b.set(3, 1, -4, B.MINERS_LANTERN)
    b.set(-3, 0, 0, B.OAK_TABLE)
    b.set(-4, 0, 0, B.OAK_CHAIR, b.facing(F.EAST))
    b.set(-2, 0, 0, B.OAK_CHAIR, b.facing(F.WEST))
    b.set(-3, 1, 0, b.hash(-3, 1, 0, 341) < 0.5 ? B.TANKARDS : B.DUSTY_BOTTLES, b.facing(FRONT))
    // The back room: two beds behind a plank partition
    b.fill(1, 0, -6, X1, H, -6, B.OAK_PLANKS)
    b.fill(4, 0, -6, 4, 1, -6, B.AIR)
    for (const x of [2, 6]) {
      b.set(x, 0, -8, B.BED_HEAD, b.facing(F.NORTH))
      b.set(x, 0, -7, B.BED_FOOT, b.facing(F.NORTH))
    }
    b.set(4, 0, -8, B.MINERS_LANTERN)
    b.keystone(0, -2, -4)
  },
}

/** A giant mushroom house: a hollow stem with a doorway and a window under a domed cap with a drooping rim. */
function mushroomHouse(
  b: PoiBuilder, cx: number, cz: number, r: number, h: number, capR: number,
  stem: number, cap: number, door: readonly [number, number]
): void {
  const trim = (dx: number, dz: number): boolean => r >= 2 && Math.abs(dx) === r && Math.abs(dz) === r
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (trim(dx, dz)) continue
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === r
      b.fill(cx + dx, 0, cz + dz, cx + dx, h - 1, cz + dz, ring ? stem : B.AIR)
      b.set(cx + dx, -1, cz + dz, ring ? stem : B.OAK_PLANKS)
      b.foundation(cx + dx, cz + dz, -2, stem, 4)
    }
  }
  // The doorway, and a little window to one side
  b.fill(cx + door[0] * r, 0, cz + door[1] * r, cx + door[0] * r, 1, cz + door[1] * r, B.AIR)
  b.set(cx - door[1] * r, 1, cz + door[0] * r, B.AIR)
  // The cap: a dome, widest at the bottom, its rim drooping one block
  const capH = Math.max(2, Math.round(capR * 0.7))
  const span = Math.ceil(capR)
  for (let k = 0; k < capH; k++) {
    const rk = capR * Math.sqrt(1 - (k / capH) ** 2)
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const d = Math.hypot(dx, dz)
        if (d <= rk + 0.3) b.set(cx + dx, h + k, cz + dz, cap)
        if (k === 0 && d > capR - 1.1 && d <= capR + 0.3 && Math.max(Math.abs(dx), Math.abs(dz)) > r) b.set(cx + dx, h - 1, cz + dz, cap)
      }
    }
  }
}

/** A village of tiny mushroom houses round a little mushroom tree, glowmoss paths and mushroom gardens. */
export const MUSHROOM_VILLAGE: PoiBuildDef = {
  kind: getPoiKind('mushroom_village'),
  radius: 11, above: 10, below: 3,
  build(b) {
    b.chamber(0, 3, 0, 10.6, 6.8, 10.2, 0, mix(b, 351, [[B.PALE_MYCELIUM, 4], [B.MOSS, 3], [B.DIRT, 3]]), 0.15)
    const kinds = [
      [B.PALE_MUSHROOM_STEM, B.PALE_MUSHROOM_CAP],
      [B.MUSHROOM, B.MUSHROOM_CAP],
      [B.BLUE_MUSHROOM, B.BLUE_MUSHROOM_CAP],
      [B.PURPLE_MUSHROOM, B.PURPLE_MUSHROOM_CAP],
      [B.FOXFIRE_MUSHROOM, B.FOXFIRE_MUSHROOM_CAP],
      [B.AMBER_MUSHROOM, B.AMBER_MUSHROOM_CAP],
    ] as const
    const pick = (salt: number): readonly [number, number] => kinds[Math.floor(b.hash(0, 0, 0, salt) * kinds.length)]
    // [centre x, centre z, stem radius, height, cap radius, door direction]
    const houses: ReadonlyArray<readonly [number, number, number, number, number, readonly [number, number]]> = [
      [0, -5, 2, 4, 4.3, [0, 1]],
      [-6, -1, 1, 3, 2.6, [1, 0]],
      [7, -1, 1, 3, 2.8, [-1, 0]],
      [-5, 5, 1, 3, 2.4, [1, 0]],
      [5, 5, 1, 3, 2.5, [-1, 0]],
    ]
    // Glowmoss paths from each door to the middle (along z, then x)
    for (const [cx, cz, r, , , door] of houses) {
      let x = cx + door[0] * (r + 1)
      let z = cz + door[1] * (r + 1)
      while (z !== 1) {
        b.set(x, -1, z, B.GLOWMOSS)
        z += z < 1 ? 1 : -1
      }
      while (x !== 0) {
        b.set(x, -1, z, B.GLOWMOSS)
        x += x < 0 ? 1 : -1
      }
    }
    houses.forEach(([cx, cz, r, h, capR, door], i) => {
      const [stem, cap] = pick(352 + i)
      mushroomHouse(b, cx, cz, r, h + (i > 0 && b.hash(cx, 0, cz, 353) < 0.4 ? 1 : 0), capR, stem, cap, door)
      if (i > 0) b.set(cx, 0, cz, b.hash(cx, 1, cz, 354) < 0.6 ? B.MINERS_LANTERN : B.BEDROLL, b.facing(F.SOUTH))
    })
    // The big house: a real door, the chest, a bedroll, a lantern and a book
    b.set(0, 0, -3, B.OAK_DOOR, b.facing(F.SOUTH))
    b.set(0, 1, -3, B.OAK_DOOR_UPPER, b.facing(F.SOUTH))
    b.chest(-1, 0, -6, FRONT)
    b.set(1, 0, -6, B.BEDROLL, b.facing(F.SOUTH))
    b.set(-1, 0, -4, B.MINERS_LANTERN)
    b.set(1, 0, -4, B.BOOK_PILE, b.facing(F.WEST))
    // The little mushroom tree in the middle, and a table under it
    b.fill(0, 0, 1, 0, 1, 1, B.PALE_MUSHROOM_STEM)
    b.fill(-1, 2, 0, 1, 2, 2, B.PALE_MUSHROOM_CAP)
    b.set(0, 3, 1, B.PALE_MUSHROOM_CAP)
    b.set(2, 0, 3, B.OAK_TABLE)
    b.set(2, 1, 3, B.TANKARDS, b.facing(FRONT))
    b.set(3, 0, 3, B.OAK_CHAIR, b.facing(F.WEST))
    // Mushroom gardens on tilled soil
    for (const [x0, z0, x1, z1] of [[2, -2, 4, -1], [-8, 2, -6, 3], [6, 2, 8, 3]]) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          b.set(x, -1, z, (x + z) % 2 === 0 ? B.DIRT : B.MOSS)
          b.set(x, 0, z, weighted(b.hash(x, 0, z, 355), [[B.BROWN_MUSHROOMS, 4], [B.CAVE_MUSHROOMS, 3], [B.PUFFBALLS, 3]]))
        }
      }
    }
    scatter(b, -10, -10, 10, 10, 0, 356, (h) => (h < 0.025 ? B.PUFFBALLS : h < 0.045 ? B.GLOW_BLOOM : h < 0.06 ? B.CAVE_MUSHROOMS : 0))
    hangFromCeiling(b, -10, -10, 10, 10, 5, 10, 357, (h) => (h < 0.03 ? B.GLOWWORM_THREADS : h < 0.06 ? B.HANGING_ROOTS : 0))
    b.keystone(0, -2, -5)
  },
}

export const OUTLAW_KINDS: readonly PoiBuildDef[] = [BANDIT_HIDEOUT, CAVE_IN, EXCAVATION_SITE, DEEPWAY_TAVERN, MUSHROOM_VILLAGE]
